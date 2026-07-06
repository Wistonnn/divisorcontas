from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import base64
import os
import json
import re
import google.generativeai as genai
from dotenv import load_dotenv
from typing import Optional

# Carrega variáveis de ambiente (para local e produção)
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(
    title="Bill Splitter OCR API",
    description="API para ler e extrair dados de faturas brasileiras",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# Adiciona CORS para evitar bloqueios em testes locais
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_json(text: str):
    """Filtra o JSON limpo da resposta do LLM."""
    try:
        # Tenta achar o JSON entre blocos de código se houver
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        return json.loads(text)
    except Exception:
        return None

@app.get("/api/health")
def health():
    return {"status": "ok", "message": "API de OCR está rodando!"}

@app.post("/api/ocr")
async def process_ocr(file: UploadFile = File(...)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Chave GEMINI_API_KEY não configurada no servidor.")

    try:
        contents = await file.read()
        mime_type = file.content_type or "image/jpeg"
        
        prompt = """
        Atue como um especialista em faturas brasileiras (Copel e Sanepar).
        Analise a imagem da fatura e extraia EXATAMENTE os seguintes campos em formato JSON:
        
        - "type": ("luz" ou "agua")
        - "month": (Apenas o nome do mês, ex: "Março")
        - "due_date": ("DD/MM/AAAA")
        - "amount": (Número decimal total a pagar, ex: 151.20)
        
        REGRAS IMPORTANTES:
        1. Para faturas da Copel (Luz), o "month" deve ser o MÊS ANTERIOR ao mês da "due_date" (Ex: Se vence em Abril, mës de referência é Março).
        2. Para faturas da Sanepar (Água), extraia o mês de referência real que está escrito na fatura.
        3. O campo "month" deve conter APENAS o nome do mês, sem o ano (ex: "Janeiro").
        4. Se o modelo não tiver certeza, ou o campo não estiver explícito, use a lógica do item 1 para faturas de Luz.
        
        Responda APENAS o JSON puro. Se não encontrar nada, retorne nulo nos campos.
        """

        image_part = {
            "mime_type": mime_type,
            "data": contents
        }

        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(
            [prompt, image_part],
            generation_config=genai.GenerationConfig(temperature=0.0)
        )

        raw_content = response.text.strip()
        data = extract_json(raw_content)

        if not data:
            raise HTTPException(status_code=422, detail="Não foi possível processar os dados da imagem.")

        return {
            "success": True,
            "data": data,
            "raw": raw_content # Para debug se necessário
        }

    except Exception as e:
        print(f"Erro no OCR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ====================================================================
# SERVIR ARQUIVOS ESTÁTICOS (HTML/CSS/JS) NO FINAL
# ====================================================================
if not os.getenv("VERCEL"):
    @app.get("/")
    async def read_index():
        return FileResponse("index.html")

    # O mount("/") deve ser a ULTIMA coisa para não sobrescrever as rotas /api
    app.mount("/", StaticFiles(directory="."), name="static")
