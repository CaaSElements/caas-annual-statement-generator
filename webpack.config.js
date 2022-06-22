const path = require("path");

const dir = path.resolve(__dirname, "dist");

const pubPath = dir.split("/").reduce((acc, folder) => {
  if (acc === "" && folder !== "node_modules") {
    return acc;
  }

  if (acc === "" || folder === "bower_components") {
    acc = "/";
  }

  acc += `${folder}/`;
  return acc;
}, "");

module.exports = {
  entry: "./src/index.js",
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: pubPath || "/dist/",
  },
};
