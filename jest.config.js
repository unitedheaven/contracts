/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testTimeout: 60000,
    rootDir: '.',
    transformIgnorePatterns: ['<rootDir>/node_modules/'],
    testMatch: ['<rootDir>/__test__/**/*.test.ts'],
};
