import "dotenv/config";
import express from "express";
import cors from "cors";
import prisma from './lib/prisma';

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("API Ludus rodando 🚀")
});

app.get("/users", async (req, res) => {
    const users = await prisma.user.findMany();
    res.json(users);
});

app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000")
})