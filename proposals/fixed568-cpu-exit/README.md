# Fixed568 CPU observer exit parser · unapplied proposal

The original observer can reject a valid exiting-task stat record before recognizing
the task's exit: fields 5 and 6 (process group/session) are signed, and a dead task
can expose the kernel's `-1` defaults and zero thread count. Linux's
[v6.14 implementation](https://github.com/torvalds/linux/blob/v6.14/fs/proc/array.c#L442-L578)
initializes these defaults before attempting the task's signal-handler lock.
The controlled Z/X/x samples reproduce `STAT_INVALID` in the original observer.
The five historical failures in run 44279033289 retain no invalid raw stat, PID or
field index; their precise causes remain UNKNOWN. This is not historical closure.

`observer.patch.json` (exact UTF-8 patch in its `patch` field) is an UNAPPLIED two-file author proposal on exact #571
`0d5593beaf673de915cc6337e254532ebb2d1117`. It admits signed numeric group/session
fields, accepts zero threads only for explicitly exited states, and omits an
identity-verified exited descendant with an explicit partial-sample marker at
either stat observation. Root exit uses the original ROOT_GONE path. PID/start-tick
reuse, malformed input, live zero-thread records, emitted-counter bounds/regression,
root scoping, bounded reads, output custody and own/reaped CPU separation remain.
No unrecorded CPU is estimated. Transient records lacking an explicit exited state
remain fail-closed. Sampled process trees never establish a complete CPU census.

All existing checkout files remain unchanged in this proposal. The second proposed
edit changes only the original parser test's observer hash; its 30 original test
bodies and assertions are retained. The unit command, application-error precedence,
eight-shard planner, strict validator, 30-second defaults, explicit original case
limits, max4 workers and 45-minute job limits remain byte-identical. No label,
retry, dispatch, installation or workflow execution is authorized by this proposal.

Run the new controlled qualification with Node24:
`node --test proposals/fixed568-cpu-exit/qualification.test.mjs`.
Its synthetic process-tree fixtures replace only the fs import in a memory-only
test image and expose the otherwise-private capture function; production source
and `/proc` remain untouched. These are numeric-fixture controls, not live Linux
or hosted acceptance. Original parser regressions pass in a separate disposable
two-file afterimage. Separate exact approval is required before authoring the
protected workflow/test edits; another diagnostic execution requires its own
one-use approval. Release 1.0 remains NO-GO / NOT READY / NOT AUTHORIZED.
