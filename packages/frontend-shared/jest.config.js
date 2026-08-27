module.exports = {
  moduleFileExtensions: ["js", "json", "ts", "tsx"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  testEnvironment: "node",
  moduleNameMapper: {
    "^@mythfood/api-client$": "<rootDir>/../api-client/src",
  },
};
