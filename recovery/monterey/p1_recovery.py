"""Offline P1 recovery preparation. No network, credential reader, or hosted CLI.

Python standard library only; the primary application still requires Node 24.
Ports below are rehearsal contracts, NOT a live provider transport or approval.
"""

import argparse
import base64
import hashlib
import json
import os
import re
import stat
import threading
from dataclasses import dataclass, field
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from types import MappingProxyType

APPROVED = "01b96075d2f04acef730114427bc595986a1f0ce2720ed7fd3c9e84e304e141a"
UUID = re.compile(r"[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}", re.I)


class Stop(Exception):
    """Generic sanitized failure; never include a token or response body."""


def digest(value):
    return hashlib.sha256(value).hexdigest()


def fingerprint(value):
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def private_bytes(path):
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_mode & 0o077 or s.st_size > 2097152:
        raise Stop("Private regular artifact required")
    return path.read_bytes()


@dataclass(frozen=True, repr=False)
class Capsule:
    target: str
    organizations: tuple
    actors: dict
    cleanup_sql: str
    operation_hash: str

    def __post_init__(self):
        object.__setattr__(self, "actors", MappingProxyType(dict(self.actors)))

    def __repr__(self):
        return "Capsule(three_tenants, fifteen_staff, identifiers_redacted)"


def load_capsule(root, expected=APPROVED):
    """Only CLI uses APPROVED; tests use disposable synthetic hashes, never live ports."""
    root = Path(root)
    if root.is_symlink() or not root.is_dir() or root.stat().st_mode & 0o077:
        raise Stop("Private capsule directory required")
    raw = private_bytes(root / "operation.private.json")
    if digest(raw) != expected:
        raise Stop("Approved operation mismatch")
    op = json.loads(raw)
    scope = {
        "maximumWindowSeconds": 1800, "fixtureSteps": 75,
        "assertionRpcProbes": 69, "domainRows": 57, "featureRows": 3,
        "customerMappings": 0, "reportLeases": 0,
        "providers": False, "media": False, "deployment": False,
    }
    if any(op.get(k) != v for k, v in scope.items()):
        raise Stop("Frozen scope mismatch")
    if not re.fullmatch(r"[a-z]{20}", op["targetProjectRef"]):
        raise Stop("Exact project required")
    if len(op["files"]) != 4 or len({x["file"] for x in op["files"]}) != 4:
        raise Stop("Artifact inventory mismatch")
    values = {}
    for name in ("p1-plan.private.json", "deactivate-features.proposed.sql"):
        entries = [x for x in op["files"] if x["file"] == name]
        data = private_bytes(root / name)
        if len(entries) != 1 or digest(data) != entries[0]["sha256"]:
            raise Stop("Frozen artifact mismatch")
        values[name] = data
    plan = json.loads(values["p1-plan.private.json"])
    companies = plan["companies"]
    orgs = tuple(c["organization_id"] for c in companies)
    if len(orgs) != 3 or len(set(orgs)) != 3 or not all(UUID.fullmatch(x) for x in orgs):
        raise Stop("Exactly three tenants required")
    actors = {}
    for company in companies:
        for actor in company["actorBindings"].values():
            if "customer" in actor["alias"]:
                continue
            if (not re.fullmatch(r"pilot-[123]-(owner|estimator|assigned-field|unassigned-field|revoked-staff)", actor["alias"])
                    or actor["organization_id"] != company["organization_id"]
                    or not UUID.fullmatch(actor["user_id"]) or actor["alias"] in actors):
                raise Stop("Exact staff roster required")
            actors[actor["alias"]] = (actor["user_id"], actor["organization_id"])
    if len(actors) != 15 or len({a[0] for a in actors.values()}) != 15:
        raise Stop("Exactly fifteen distinct staff required")
    return Capsule(op["targetProjectRef"], orgs, actors,
                   values["deactivate-features.proposed.sql"].decode(), expected)


@dataclass(frozen=True)
class Request:
    method: str
    url: str = field(repr=False)
    body: object = field(repr=False)
    token: str = field(default="", repr=False)


class Commands:
    """Only fixed request descriptions. No sending, redirects, arbitrary SQL or host input."""
    def __init__(self, capsule):
        self.c = capsule

    def _query(self, sql):
        return Request("POST", "https://api.supabase.com/v1/projects/" + self.c.target + "/database/query", {"query": sql})

    def deactivate(self):
        return self._query(self.c.cleanup_sql)

    def observe(self):
        # Digests exclude approved controls so legitimate deactivation does not
        # mask any change to unrelated tenants. No Auth secret columns are read.
        orgs = ",".join("'" + x + "'::uuid" for x in self.c.organizations)
        return self._query(
            "select jsonb_build_object('features',coalesce((select jsonb_agg("
            "jsonb_build_object('organization_id',organization_id,'enabled',enabled) order by organization_id) "
            "from private.property_features where organization_id in (" + orgs + ")), '[]'::jsonb),"
            "'unrelated_features',coalesce((select jsonb_agg(md5(to_jsonb(t)::text) order by organization_id) "
            "from private.property_features t where organization_id not in (" + orgs + ")), '[]'::jsonb),"
            "'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'user_id',user_id) order by id) "
            "from auth.sessions), '[]'::jsonb),"
            "'identity_factor_digest',(select md5(coalesce(string_agg(id::text||':'||coalesce(email_confirmed_at::text,'UNCONFIRMED'),'' order by id),'')) from auth.users)"
            "||(select md5(coalesce(string_agg(id::text||user_id::text||factor_type::text||status::text,'' order by id),'')) from auth.mfa_factors)"
            ") as state"
        )

    def user(self, token):
        return Request("GET", "https://" + self.c.target + ".supabase.co/auth/v1/user", None, token)

    def logout(self, token):
        # Narrower than primary worker's GLOBAL logout: only the exact exercised
        # session. This proposal needs separate live review/verification.
        return Request("POST", "https://" + self.c.target + ".supabase.co/auth/v1/logout?scope=local", None, token)


@dataclass(repr=False)
class Session:
    uid: str
    sid: str
    expires: int
    token: str = field(repr=False)

    def __repr__(self):
        return "Session(redacted)"


class OneShot:
    """Independent second-Mac journal. Never stores credentials, tokens or UIDs."""
    def __init__(self, root, operation_hash):
        self.root = Path(root)
        self.operation_hash = operation_hash
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.root.is_symlink() or self.root.stat().st_mode & 0o077:
            raise Stop("Private recovery journal required")

    def reserve(self):
        path = self.root / "recovery-attempt.json"
        fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            data = json.dumps({"operationSha256": self.operation_hash, "state": "ATTEMPTED_NO_REPLAY"}).encode()
            with os.fdopen(fd, "wb", closefd=False) as out:
                out.write(data)
                out.flush()
                os.fsync(fd)
        finally:
            os.close(fd)
        directory = os.open(str(self.root), os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)


def validate_state(value, capsule):
    if not isinstance(value, dict) or set(value) != {"features", "unrelated_features", "sessions", "identity_factor_digest"}:
        raise Stop("Observation unconfirmed")
    if (not isinstance(value["features"], list) or not isinstance(value["sessions"], list)
            or not isinstance(value["unrelated_features"], list)
            or not re.fullmatch(r"[a-f0-9]{64}", value["identity_factor_digest"])):
        raise Stop("Malformed observation")
    features = value["features"]
    if (len({x["organization_id"] for x in features}) != len(features)
            or any(x["organization_id"] not in capsule.organizations or type(x["enabled"]) is not bool for x in features)
            or any(not re.fullmatch(r"[a-f0-9]{32}", x) for x in value["unrelated_features"])):
        raise Stop("Feature observation invalid")
    sessions = value["sessions"]
    if (len({x["id"] for x in sessions}) != len(sessions)
            or any(not UUID.fullmatch(x["id"]) or not UUID.fullmatch(x["user_id"]) for x in sessions)):
        raise Stop("Session observation invalid")
    return value


class Recovery:
    """Rehearsable independent custody/state machine; no production transport supplied.

    Future adapter must verify TLS, refuse redirects/proxies, enforce per-request
    deadlines, authenticate getUser, and keep credentials in protected memory.
    No login, MFA, token refresh, database DELETE or session-token persistence.
    """
    def __init__(self, capsule, ports, clock, journal):
        self.c = capsule
        self.commands = Commands(capsule)
        self.ports = ports
        self.clock = clock
        self.journal = journal
        self.sessions = {}
        self.lock = threading.Lock()
        self.attempted = False

    def verified_session(self, alias, token, cleanup_only=False):
        # Remote Auth verifies this exact bearer; claims alone are never authority.
        try:
            if alias not in self.c.actors or len(token) > 16384:
                raise Stop("Handoff unavailable")
            user = self.ports.user(self.commands.user(token))
            part = token.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
            uid = self.c.actors[alias][0]
            if (user.get("id") != uid or not user.get("email_confirmed_at")
                    or user.get("is_anonymous") or claims.get("sub") != uid
                    or claims.get("role") != "authenticated"
                    or claims.get("iss") != "https://" + self.c.target + ".supabase.co/auth/v1"
                    or not UUID.fullmatch(claims.get("session_id", ""))
                    or type(claims.get("exp")) is not int
                    or claims["exp"] <= self.clock() + (180 if cleanup_only else 1860)
                    or claims.get("aal") not in ("aal1", "aal2")):
                raise Stop("Session binding invalid")
            return Session(uid, claims["session_id"], claims["exp"], token)
        except Exception:
            raise Stop("Verified custody unconfirmed") from None

    def accept(self, alias, token):
        # This ordinary custody handoff remains serialized against cleanup.
        with self.lock:
            if self.attempted:
                raise Stop("Handoff unavailable")
            session = self.verified_session(alias, token)
            prior = self.sessions.get(alias)
            if prior and prior.sid != session.sid:
                raise Stop("Session replacement forbidden")
            self.sessions[alias] = session

    def recover(self, prepare_sessions=None):
        # Single durable local attempt, independent of the primary journal.
        with self.lock:
            if self.attempted:
                raise Stop("No automatic replay")
            self.attempted = True
            self.journal.reserve()
        before = None
        try:
            before = validate_state(self.ports.observe(self.commands.observe()), self.c)
        except BaseException:
            pass
        deactivated = True
        try:
            self.ports.deactivate(self.commands.deactivate())
        except BaseException:
            deactivated = False  # UNKNOWN never authorizes an automatic retry.
        revoked = True
        if prepare_sessions is not None:
            try:
                prepare_sessions(before)
            except BaseException:
                revoked = False
        def logout(session):
            try:
                self.ports.logout(self.commands.logout(session.token))
                return True
            except BaseException:
                return False
        # A 15x sequential network timeout would exhaust the containment budget.
        # Future real ports MUST impose an8-second request/response deadline.
        try:
            with ThreadPoolExecutor(max_workers=15) as pool:
                revoked = all(list(pool.map(logout, self.sessions.values()))) and revoked
        except BaseException:
            revoked = False
        after = None
        try:
            after = validate_state(self.ports.observe(self.commands.observe()), self.c)
        except BaseException:
            pass
        complete = False
        if before is not None and after is not None:
            pairs = {(s.sid, s.uid) for s in self.sessions.values()}
            allowed_uids = {a[0] for a in self.c.actors.values()}
            old = {(x["id"], x["user_id"]) for x in before["sessions"]}
            new = {(x["id"], x["user_id"]) for x in after["sessions"]}
            complete = (
                all(not x["enabled"] for x in after["features"])
                and {x["organization_id"] for x in before["features"]} == {x["organization_id"] for x in after["features"]}
                and not any(uid in allowed_uids for _, uid in new)
                and new == old - pairs
                and before["unrelated_features"] == after["unrelated_features"]
                and before["identity_factor_digest"] == after["identity_factor_digest"]
            )
        return {"status": "REHEARSAL_VERIFIED" if complete and deactivated and revoked else "CONTAINMENT_REQUIRED",
                "deactivation": "CONFIRMED" if deactivated else "UNKNOWN",
                "sessionRequests": len(self.sessions), "automaticRetries": 0,
                "hostedVerification": False}


def main():
    parser = argparse.ArgumentParser(description="Offline P1 recovery capsule inspection only; no hosted mode.")
    parser.add_argument("capsule", type=Path)
    args = parser.parse_args()
    try:
        c = load_capsule(args.capsule)
        print(json.dumps({"mode": "OFFLINE_ONLY", "tenants": 3, "staffAliases": len(c.actors),
                          "operationSha256": c.operation_hash, "hostedEnabled": False}))
    except Exception:
        parser.exit(2, "Capsule verification failed; no hosted action attempted.\n")


if __name__ == "__main__":
    main()
