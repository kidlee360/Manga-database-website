import express from "express";
import bodyParser from "body-parser";
import pg from "pg"; 
import axios from "axios";
import session from "express-session";

const app = express();
const port = 3000; 

app.use(
  session({
    secret: "your-secret-key", // Replace with a secure secret key
    resave: false,
    saveUninitialized: true,
  })
);

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "manga",
  password: "Kidlee360@postgres",
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
// app.use(bodyParser.json());
app.use(express.static("public"));

let users = [];

async function getUsers() {
  const result = await db.query("select * from users");
  users = result.rows;
}

let currentUserId = 1; // Set this to the appropriate user ID

async function getCurrentUser() {
  const result = await db.query("select * from users");
  users = result.rows;
  return users.find((user) => user.id == currentUserId);
};

async function mangaData() {
  const res = await db.query("select * from manga where user_id = $1",[currentUserId]);
  const manga = res.rows;
  console.log(manga);
}

app.get("/", async (req, res) => {
  await getUsers();
  await mangaData();
  res.render("index.ejs", {users: users, /*genre:, title:, cover:, rating:*/});
});

app.post("/", async (req, res) => {
  console.log(req.body);
  const title = req.body.title;
  req.session.title = title; // Store the title in the session
  const response = await axios.get(`https://api.mangadex.org/manga?title=${title}&includes[]=cover_art`);
  const manga = response.data.data[0];
  const cover = `https://uploads.mangadex.org/covers/${manga.id}/${manga.relationships[2].attributes.fileName}`;
  const description = manga.attributes.description.en;
  const genre = manga.attributes.tags[1].attributes.name.en;
  console.log(manga.relationships[2].attributes.fileName);
  console.log(manga.attributes.description.en);
  console.log(manga.attributes.tags[1].attributes.name.en);
  await getUsers();
  res.render("manga.ejs", { title: title, users: users, cover: cover, description: description, genre: genre });
});

app.post("/addmanga", async (req, res) => {
  console.log(req.body);
  const response = await axios.get(`https://api.mangadex.org/manga?title=${title}&includes[]=cover_art`);
  const manga = response.data.data[0];
  const user_id = req.body.user_id;
  const title = req.session.title;
  const rating = req.body.rating;
  const genre = manga.attributes.tags[1].attributes.name.en;
  const cover = `https://uploads.mangadex.org/covers/${manga.id}/${manga.relationships[2].attributes.fileName}`;
  await db.query("insert into manga (user_id, name, rating, genre, image) values ($1, $2, $3, $4, $5)", [user_id, title, rating, genre, cover]);
  res.redirect("/");
  console.log(req.body);
});

app.post("/user", async (req, res) => {
  console.log(req.body);
  if (req.body.add === "New User") {
    res.render("new.ejs");    
  } else {
    currentUserId = req.body.user;
    res.redirect("/");
  }
});






app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
