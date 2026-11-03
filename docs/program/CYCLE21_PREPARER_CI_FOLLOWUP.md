# Cycle 21 preparer follow-up

The exact `2fecb89213647b567746c0413a9ba3e41ce748ae` Cycle 18 run `41724793162` failed one immediate Cycle 17 static host assertion (445 passed, one failed). Its artifact identifies the same obsolete preparer name as the earlier correction. This is separate from the historical Cycle 18 browser timeouts, whose cause remains undetermined.

A local source-based search and focused reproduction found the identical mismatch in five remaining retained suites (Cycles 10, 12, 15, 16 and 17): 66 passed, five failed. The correction requires the actual single awaited `prepareSources` call and additionally the original `prepareOperatingSources` default. All original isolation/navigation assertions remain. The same 71 tests now pass. No runtime, protected bytes, workflow or timeout changed.

No manual CI rerun. Automatic checks follow this forward commit. Original failed/cancelled records and broad Foundation gaps remain visible; no green rollup is inferred. Release 1.0 remains NOT READY / NOT AUTHORIZED.
