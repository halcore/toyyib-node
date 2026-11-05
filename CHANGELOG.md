# Changelog

## 0.1.0 (2026-11-05)


### Features

* add cursor and numbered paging with for-await support ([944bb4d](https://github.com/halcore/toyyib-node/commit/944bb4de4a9e1ede65f0b18eeffb359d7ba801f1))
* add ETFs, markets, reports, portfolio, usage and the Toyyib client ([d6e5cb1](https://github.com/halcore/toyyib-node/commit/d6e5cb10d8884aac6c363b722eb102540bb37cc3))
* add stocks and filings ([e8388ad](https://github.com/halcore/toyyib-node/commit/e8388ada5097fd2950df4441483d8e27ae34c1d6))
* add typed errors and the request transport ([5c3bfb6](https://github.com/halcore/toyyib-node/commit/5c3bfb6ea4b2db0a3bc946ada4a3bc82fe92e0ce))
* generate API types from a filtered schema snapshot ([0ce601c](https://github.com/halcore/toyyib-node/commit/0ce601c62705e3f15703a5c924cd9dedb40efe04))
* read client options and the API key safely on every runtime ([364b03d](https://github.com/halcore/toyyib-node/commit/364b03d3d183cf71e6973c4c9846567e6c82bbba))
* retry network errors, server errors and short rate limits ([78d3e8b](https://github.com/halcore/toyyib-node/commit/78d3e8b59932bb7b1d59ff1d9bc438db23f89e1b))


### Bug Fixes

* reject a baseURL that isn't an http or https URL ([ed88091](https://github.com/halcore/toyyib-node/commit/ed880915e36d2058991515ecdbcd07f0cb8c1d07))
* reject a maxRetries or timeout that can't work ([6e05948](https://github.com/halcore/toyyib-node/commit/6e05948a77d0b20d921adf10c2133e5abdb21fbd))
* reject a success reply that has no data ([f80d1eb](https://github.com/halcore/toyyib-node/commit/f80d1ebbf79de6bea12831d6f7363a5826687468))
* say why a connection failed ([9a0d931](https://github.com/halcore/toyyib-node/commit/9a0d931d9201d5bf7f5c574aad316403cf7bc9b3))
