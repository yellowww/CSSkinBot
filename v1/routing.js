const express = require("express");
const fs = require("fs");
const main = require("./index.js")
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req,res) => {
    fs.readFile("./public/main.html", (err,html) => {
        if(err) return console.error(err);
        res.contentType("text/html");
        res.send(html);
    })
})

app.get("/data", (req, res) => {
    res.contentType("text/json")
    res.send(JSON.stringify(main.getData()));
})

app.listen(3040, ()=>console.log("listening on port 3040"));
