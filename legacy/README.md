# Not the project - just the old gym, cut into pieces

These files are `BitBot Gym.html` sliced at its section comments. They are not
modules: no imports, no exports, and they lean on globals the single file
happened to have in scope. They are here only to be read while the real
modules in `src/` are written, one piece at a time, with tests.

Nothing in `src/` may import anything from here, and the layering test makes
sure of it. When `src/` passes the full hex regression, this folder goes.
