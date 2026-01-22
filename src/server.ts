import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from './lib/prisma';
import authRoutes from "./routes/auth.routes"; 
import { gameRoutes } from "./routes/game.routes";

const app = express();

app.use(cors());
app.use(express.json());


app.use("/auth", authRoutes); 

app.use("/games", gameRoutes)

app.get("/", (req, res) => {
    res.send("API Ludus rodando 🚀")
});

app.get("/users", async (req, res) => {
    const users = await prisma.user.findMany();
    res.json(users);
});

app.listen(3000, "0.0.0.0", () => {
    console.log("Servidor rodando em http://0.0.0.0:3000")
})