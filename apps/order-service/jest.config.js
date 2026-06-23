module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@mythfood/shared-kernel$":
      "<rootDir>/../../../packages/shared-kernel/src",
    "^@mythfood/event-contracts$":
      "<rootDir>/../../../packages/event-contracts/src",
    "^@mythfood/common$": "<rootDir>/../../../packages/common/src",
  },
};
