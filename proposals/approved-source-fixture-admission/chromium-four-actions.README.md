This is review data for the exact four APT actions reported by #559's PR Passport job after the original signed-source/font step passed. It does not apply the helper patch. The push event stopped earlier at the existing AWS-mirror denial; that denial remains unchanged. The four names may include upgrades: the retained dry-run output does not distinguish missing packages from upgrades.

Protected target: `scripts/cycle30-chromium-dependencies.mjs`, before SHA256 `531b1f3b43e38975a456a8421fc7135991b89313e22e0f87daa5ecc673bf659f`, proposed after `e2b034cfbdf1e7b3b44e8f2eb3b51ffabec5341097ed9cb1d2307a65f36ba762`. Patch SHA256 `5399256c239142a5b84ec2ef601ef18414e6a2c8dc51038b520ebafae00d27a3` is embedded with the full proposed helper body in the proposal JSON. Exactly four package literals precede the original nine fonts. Reversing those four lines restores every original byte, including all mirror/source/key/CI checks, sudo arguments and restricted APT source options.

Original eleven unit cases passed on an owned helper-only afterimage, with their original assertions/configuration/budgets. Thirteen new pure controls and a separate review cover the exact command delta and retained source/mirror denials. These results are command-data qualification; they are not a signed APT installation, browser result or full-source acceptance. The original nine-only test title is broader than its assertions; no assertion or historical evidence was changed.

Run the new pure controls from this repository with Node 24:

```sh
node --test proposals/approved-source-fixture-admission/chromium-four-actions.controls.mjs
```

The canonical helper stays unchanged. Exact owner approval is required before applying the protected patch. A resulting source author also needs its own fresh whole-physical-frame and canonical read-set review: the current full-source guard denies the changed helper hash. No source-map repin, historical read port or test-header admission is included. Signed package installation and browser verification remain separate evidence. Ubuntu24.04 already selected both Azure and AWS runner images in the observed events; this packet does not add a mirror, rewrite runner sources or assume that another identical OS label selects Azure. All operational, genuine Auth, recovery and release gates remain closed.
