const path = require("path");

const dir = path.resolve(__dirname, "dist");

const pubPath = dir.split("/").reduce((acc, folder) => {
  if (acc === "" && folder !== "node_modules") {
    return acc;
  }

  if (acc === "") {
    acc = "/";
  }

  if (folder === "@bower_components") {
    acc = "/bower_components";
    folder = "";
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
