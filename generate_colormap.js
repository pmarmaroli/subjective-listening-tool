const colormap = require("colormap");
const colors = colormap({
  colormap: "hot",
  nshades: 256,
  format: "float",
});
const fs = require("fs");
fs.writeFile("hot-colormap.json", JSON.stringify(colors), (err) => {
  if (err) {
    console.error("Error writing file:", err);
  } else {
    console.log("File written successfully");
  }
});
