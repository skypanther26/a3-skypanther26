const express = require("express"),
  { MongoClient, ObjectId } = require("mongodb"),
  cookie = require("cookie-session"),
  app = express(),
  compression = require("compression");
app.use(compression());

app.use(express.static("public"));
app.use(express.json());

// use express.urlencoded to get data sent by defaut form actions
// or GET requests
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// cookie middleware! The keys are used for encryption and should be
// changed
app.use(
  cookie({
    name: "session",
    keys: ["key1", "key2"],
  })
);

const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@${process.env.HOST}`;
const client = new MongoClient(uri);

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  async function registerUser() {
    try {
      const authnDB = await client.db("A3").collection("users");
      const hashedPassword = password; //come back and hash this

      const result = await authnDB.insertOne({
        username: username,
        password: hashedPassword,
      });

      res.status(201).send("User registered successfully.");
    } catch (error) {
      console.error("Error during registration:", error);
      res.status(500).send("Registration error.");
    }
  }

  registerUser();
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  async function authenticate() {
    try {
      const authnDB = await client.db("A3").collection("users");
      const user = await authnDB.findOne({ username: username });
      if (user && password === user.password) {
        req.session.login = true;
        req.session.userId = user._id.toString();
        res.redirect("/main.html");
      } else {
        console.log("Incorrect credentials");
        res.redirect("/index.html");
      }
    } catch (error) {
      console.error("Error during authentication:", error);
    }
  }

  authenticate();
});

// add some middleware that always sends unauthenicaetd users to the login page
const requireAuth = (req, res, next) => {
  if (req.session.login) {
    next();
  } else {
    res.redirect("/index.html");
  }
};

// protect main
app.get("/main.html", requireAuth, (req, res) => {
  res.sendFile("main.html", { root: "/app" });
});

// protect routes
app.use(requireAuth);

let collection = null;

async function run() {
  await client.connect();
  collection = await client.db("A3").collection("toDoData");
}
run();

// route to get all docs
app.get("/docs", async (req, res) => {
  const userId = req.session.userId;
  if (collection !== null && userId) {
    const docs = await collection.find({ userId }).toArray();
    res.json(docs);
  }
});

app.use((req, res, next) => {
  if (collection !== null) {
    next();
  } else {
    res.status(503).send();
  }
});

app.post("/add", async (req, res) => {
  try {
    const userId = req.session.userId;
    const { item, notes, deadline } = req.body;

    //calculate priority based on deadline and current date
    const [year, month, day] = req.body.deadline.split("-").map(Number);
    const parsedDeadline = new Date(year, month - 1, day); // Date(year, month-1, day)
    const today = new Date();

    console.log("Today's Date:", today);
    console.log("Deadline Date:", deadline);

    if (parsedDeadline < today) {
      req.body.priority = "High";
    } else if (parsedDeadline > today) {
      req.body.priority = "Low";
    } else {
      req.body.priority = "Medium";
    }
    const priority = req.body.priority;
    console.log(`Priority is ${priority}`);

    // done checkbox default false
    req.body.done = false;

    const result = await collection.insertOne({
      item,
      notes,
      deadline,
      priority,
      done: req.body.done,
      userId,
    });
    res.json(result);
  } catch (error) {
    console.error("Error adding document:", error);
    res.status(500).send("Error adding document.");
  }
});

app.delete("/remove/:id", async (req, res) => {
  const result = await collection.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.json(result);
});

app.put("/update/:id", async (req, res) => {
  const { id } = req.params;
  const { item, notes, deadline, done } = req.body;

  const result = await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { item, notes, deadline, done } }
  );

  res.json(result);
});

app.post("/logout", (req, res) => {
  req.session = null;
  console.log("User logged out");
  res.redirect("/index.html");
});
app.listen(process.env.PORT || 3000);
