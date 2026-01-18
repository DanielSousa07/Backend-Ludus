import { Router } from "express";
import { login } from "../services/auth.service"; // Importa a função que já analisamos

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

export default router;