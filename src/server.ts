import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from './lib/prisma';
import authRoutes from "./routes/auth.routes"; 
import { gameRoutes } from "./routes/game.routes";
import { gameCopyRoutes } from "./routes/gameCopy.routes";
import { rentalRoutes } from "./routes/rental.routes";
import { adminRentalRoutes } from "./routes/adminRental.routes";
import { engagementRoutes } from "./routes/engagement.routes";
import { favoritesRoutes } from "./routes/favorites.routes";

const app = express();

app.use(cors());
app.use(express.json());


app.use("/auth", authRoutes); 

app.use("/games", gameRoutes)
app.use("/games", gameCopyRoutes)

app.use("/favorites", favoritesRoutes);
app.use("/rentals", rentalRoutes);
app.use("/admin/rentals", adminRentalRoutes);
app.use("/engagement", engagementRoutes);

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