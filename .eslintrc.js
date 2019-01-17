module.exports = {
  extends: ["prettier", "eslint:recommended"],
  plugins: ["prettier"],
  parser: "babel-eslint",
  rules: {
    "prettier/prettier": [1, { trailingComma: "all" }],
    "no-console": "off"
  },
  env: {
    es6: true,
    browser: true,
    node: true
  }
};
