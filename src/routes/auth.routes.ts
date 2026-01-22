import { Router } from "express";
import { login } from "../services/auth.service"; 
import bcrypt from "bcryptjs";
import {prisma} from "../lib/prisma"

const router = Router();

router.post("/login", async (req, res) => {
    const { email, senha } = req.body;

    try {
        const data = await login(email, senha);
        return res.json(data);
    } catch (error: any) {
        return res.status(401).json({ error: error.message });
    }
});

router.post("/register", async (req, res) => {
    const { name, email, senha } = req.body;
    try {
    
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(senha, salt);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                senhaHash: hash, 
                password: senha  
            }
        });
        return res.status(201).json(newUser);
    } catch (error: any) {
        return res.status(400).json({ error: "Erro ao criar usuário" });
    }
});

export default router;