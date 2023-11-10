# United Heaven Contracts

## Documentation

This Project uses TEALScript. Refer to the
[TEALScript documentation](https://tealscript.algo.xyz) for more information.

### Build Contract

`npm run build` will compile the contract to TEAL and generate an ABI and
appspec JSON in [./contracts/artifacts](./contracts/artifacts/) and a algokit
TypeScript client in [./contracts/clients](./contracts/clients/).

`npm run compile-contract` or `npm run generate-client` can be used to compile
the contract or generate the contract seperately.

### Run Tests

`npm run test` will execute the tests defined in [./\_\_test\_\_](./__test__)

### Lint

`npm run lint` will lint the contracts and tests with ESLint.
