import axios from "axios";

export async function searchLudopedia(query: string) {
    const API_KEY = process.env.LUDOPEDIA_API_KEY 
    const URL = `https://base.ludopedia.com.br/api/v1/jogos?search=${query}`;

    try {
        const response  = await axios.get(URL, {
            headers: {"Authorization": `Bearer ${API_KEY}`}
        });

        return response.data.jogos.map((j: any) => ({
            id: j.id_jogo,
            name: j.nm_jogo,
            image: j.thumb // image aquii
        }));
        
    } catch( error )  {
        throw new Error("Erro ao consultar Ludopedia");
    }
}