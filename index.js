import express from "express";
import bodyParser from "body-parser";
import pg from "pg"; 
import axios from "axios";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";

const app = express();
const port = 3000; 
const saltRounds = 10;
env.config();

app.set('view engine', 'ejs');

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());


let users = [];
let manga = [];

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
  manga = res.rows;
};

app.get("/login", async (req, res) => {
  res.render("user.ejs")
});

app.get("/signup", async (req, res) => {
res.render("user.ejs", {user: "New User"})
});

app.get("/chat", async (req, res) => {
  res.render("chat.ejs");
})
    
app.get("/addUser", async (req, res) => {
  
  await getUsers();
  await mangaData();
 // console.log(manga);
 if (req.isAuthenticated()) {
    res.render("index.ejs", { manga: manga /*genre: manga.genre, title: manga.name, cover: manga.image, rating: manga.rating*/});;
  } else {
    res.redirect("/login");
  }
  
});

app.get("/", async (req, res) => {
  const response = await db.query("select * from manga");
  const manga = response.rows;
  let topManga = [];
  
  // Get the average rating for each manga and list the top 10 highest rated
  const result = await db.query(`
    SELECT name, image, genre, AVG(rating)::numeric(10,2) AS avg_rating
    FROM manga
    GROUP BY name, image, genre
    ORDER BY avg_rating DESC
    LIMIT 10
  `);

  topManga = result.rows;

  let topRatedByUsers = [];
  // Get the most rated manga by number of users and list the top 10
  const mostRatedManga = await db.query(`
    SELECT name, image, genre, COUNT(user_id) AS ratings_count
    FROM manga
    GROUP BY name, image, genre
    ORDER BY ratings_count DESC
    LIMIT 10
  `);
  topRatedByUsers = mostRatedManga.rows;
  res.render("home.ejs", {topManga: topManga, topRated: topRatedByUsers});
});

app.post("/search", async (req, res) =>{
  const title = req.body.title;

  // Check if manga exists in the database
  const dbResult = await db.query(
    "SELECT * FROM manga WHERE LOWER(name) = LOWER($1)",
    [title]
  );

  if (dbResult.rows.length > 0) {
    // Manga found in database, get all reviews and ratings
    const reviewsResult = await db.query(
      "SELECT m.*, u.username FROM manga m JOIN users u ON m.user_id = u.id WHERE LOWER(m.name) = LOWER($1)",
      [title]
    );
    // Fetch description from Mangadex API
    const response = await axios.get(`https://api.mangadex.org/manga?title=${title}&includes[]=cover_art`);
    const description = response.data.data[0].attributes.description.en;

    const mangaInDb = reviewsResult.rows;
    res.render("manga.ejs", {
      search: "home search",
      title: title,
      manga: mangaInDb,
      cover: mangaInDb[0].image,
      genre: mangaInDb[0].genre,
      description: description,
    });
  } else {
    // Manga not found, search in Mangadex API
    const response = await axios.get(`https://api.mangadex.org/manga?title=${title}&includes[]=cover_art`);
    const manga = response.data.data[0];
    if (!manga) {
      return res.render("manga.ejs", { title, manga: null, reviews: [], cover: null, genre: null, description: "No results found." });
    }
    const cover = `https://uploads.mangadex.org/covers/${manga.id}/${manga.relationships[2].attributes.fileName}`;
    const description = manga.attributes.description.en;
    const genre = manga.attributes.tags[1]?.attributes.name.en || "Unknown";
    res.render("manga.ejs", {
      search: "search",
      title: title,
      manga: null,
      reviews: [],
      cover: cover,
      genre: genre,
      description: description
    });
  }
})

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
  const title = req.session.title;
  const response = await axios.get(`https://api.mangadex.org/manga?title=${title}&includes[]=cover_art`);
  const manga = response.data.data[0];
  const user_id = currentUserId;
  const rating = req.body.rating;
  const genre = manga.attributes.tags[1].attributes.name.en;
  const cover = `https://uploads.mangadex.org/covers/${manga.id}/${manga.relationships[2].attributes.fileName}`;

  // Check if the genre exists in the Genre array
  const availableGenres = ["Action","Romance","Adventure","Horror","Drama","Sci-Fi","Fantasy","Comedy"]; // Replace with the actual Genre array from index.ejs
  if (!availableGenres.includes(genre)) {
    req.session.tempManga = { title, rating, genre, cover }; // Store manga details in session
    return res.redirect("/selectGenre"); // Redirect to genre selection page
  }

  await db.query("insert into manga (user_id, name, rating, genre, image) values ($1, $2, $3, $4, $5)", [user_id, title, rating, genre, cover]);
  res.redirect("/");
  console.log(req.body);
});

app.get("/selectGenre", (req, res) => {
  const tempManga = req.session.tempManga;
  if (!tempManga) return res.redirect("/"); // Redirect if no manga data is stored in session
  const availableGenres = ["Action","Romance","Adventure","Horror","Drama","Sci-Fi","Fantasy","Comedy"]; // Replace with the actual Genre array
  res.render("selectGenre.ejs", { tempManga, availableGenres });
});

app.post("/selectGenre", async (req, res) => {
  const selectedGenre = req.body.genre;
  const { title, rating, cover } = req.session.tempManga;
  const user_id = currentUserId;

  await db.query("insert into manga (user_id, name, rating, genre, image) values ($1, $2, $3, $4, $5)", [user_id, title, rating, selectedGenre, cover]);
  req.session.tempManga = null; // Clear temporary manga data
  res.redirect("/");
});

app.post("/user", async (req, res) => {
  console.log(req.body);
  if (req.body.user === "New User") {
    res.render("user.ejs", { user: "New User" });    
  } else if (req.body.user === "Switch User") {
    res.render("user.ejs", { user: "Select User" }); 
  } else {
    req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
  }
});


//
app.post("/addUser", async (req, res) => {
  const userName = req.body.username;
  const email = req.body.email;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE username = $1", [
      userName,
    ]);

    if (checkResult.rows.length > 0) {
      currentUserId = checkResult.rows[0].id;
      res.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *",
            [userName, email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log("success");
            currentUserId = user.id;
            res.redirect("/addUser");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});
//

app.post("/description", async (req, res) => {
  console.log(req.body);
  const note = req.body.note;
  const mangaId = req.body.mangaId; // Assuming you pass manga ID in
  await db.query("update manga set description = $1 where id = $2", [note, mangaId]);
  res.redirect("/");
});

app.get("/api/manga", async (req, res) => {
  // Fetch manga data as you do for EJS
  const result = await db.query("SELECT * FROM manga WHERE user_id = $1", [currentUserId]);
  res.json(result.rows);
});

app.get("/api/genres", (req, res) => {
  const Genres = ["Action","Romance","Adventure","Horror","Drama","Sci-Fi","Fantasy","Comedy"];
  res.json(Genres);
});

//when you addthe sign in with google function
app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get("/auth/google/userPage", 
  passport.authenticate("google", {
    successRedirect: "/addUser",
    failureRedirect: "/signup",
  })
);


passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE username = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            //Error with password check
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              //Passed password check
              currentUserId = user.id;
              return cb(null, user);
            } else {
              //Did not pass password check
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);


passport.use(
  "google",
  new GoogleStrategy({
     clientID: process.env.GOOGLE_CLIENT_ID,
     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
     callbackURL: "http://localhost:3000/auth/google/userPage",
  }, async(accessToken, refreshToken, profile, cb) => {
    console.log(profile);
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [profile.email]);
      if (result.rows.length === 0) {
        return cb(null, false);// User not found, authentication failed
      } else {
        currentUserId = result.rows[0].id;
        return cb(null, result.rows[0]);
      }
    } catch (error) {
      return cb(error);
    }
  })
);


//not really sure what it does but it was in the original code and seems important for login sessions so just copy and paste
passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
