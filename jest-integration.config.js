module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  setupFiles: ['reflect-metadata'],
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  testEnvironment: 'node',
  testTimeout: 30000,
  maxWorkers: 1,
  moduleNameMapper: {
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
  },
};
