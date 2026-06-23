module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@mythfood/shared-kernel$': '<rootDir>/../../packages/shared-kernel/src',
    '^@mythfood/event-contracts$': '<rootDir>/../../packages/event-contracts/src',
    '^@mythfood/common$': '<rootDir>/../../packages/common/src',
  },
};
