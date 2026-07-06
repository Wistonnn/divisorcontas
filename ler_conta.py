import os
import base64
import json
import sys
from groq import Groq
from dotenv import load_dotenv
import requests

# Carrega variáveis de ambiente
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# CONFIGURAÇÕES SUPABASE
SUPABASE_URL = 'https://lrbmineygusspbialpnv.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyYm1pbmV5Z3Vzc3BiaWFscG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjQ1MjcsImV4cCI6MjA5MDA0MDUyN30.5IC9m4D4Tz4P2N8sY40fgtDl41Lpvg-In3cvZ_kCbLY'

def encode_image(image_path):
    """Converte a imagem em base64."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def get_bill_data_from_groq(image_path):
    """Usa o Llama 3.2 Vision para extrair dados da conta."""
    client = Groq(api_key=GROQ_API_KEY)
    base64_image = encode_image(image_path)
    
    # Prompt especializado para extrair JSON
    prompt = """
    Atue como um especialista em faturas de concessionárias brasileiras (Copel e Sanepar).
    Analise a imagem da fatura e extraia EXATAMENTE os seguintes campos em formato JSON:
    
    - "type": (pode ser "luz" ou "agua")
    - "month": (mês de referência no formato "Mês/Ano", ex: "Março/2026")
    - "due_date": (data de vencimento no formato "DD/MM/AAAA")
    - "amount": (valor total a pagar como um número decimal, use ponto em vez de vírgula)
    
    Responda APENAS o objeto JSON puro, sem textos adicionais ou blocos de código markdown.
    """

    try:
        completion = client.chat.completions.create(
            model="llama-3.2-90b-vision-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                            },
                        },
                    ],
                }
            ],
            temperature=0, # Queremos precisão
            max_tokens=1024,
        )
        
        # Tenta parsear o JSON retornado
        content = completion.choices[0].message.content.strip()
        # Remove possíveis blocos de código ```json ... ``` que alguns modelos insistem em colocar
        clean_content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_content)
    except Exception as e:
        print(f"Erro ao processar imagem no Groq: {e}")
        return None

def save_to_supabase(data):
    """Envia os dados validados para o Supabase via REST API."""
    url = f"{SUPABASE_URL}/rest/v1/bills"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    
    payload = {
        "type": data["type"],
        "month": data["month"],
        "due_date": data["due_date"],
        "amount": data["amount"],
        "is_paid": False
    }

    response = requests.post(url, json=payload, headers=headers)
    if response.status_code in [200, 201]:
        print("\n✅ Sucesso! Registro inserido no Supabase.")
    else:
        print(f"\n❌ Erro ao salvar: {response.status_code} - {response.text}")

def main():
    if not GROQ_API_KEY:
        print("Erro: Chave GROQ_API_KEY não encontrada no arquivo .env")
        return

    if len(sys.argv) < 2:
        print("Uso: python ler_conta.py <caminho_da_imagem>")
        return

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        print(f"Erro: Arquivo '{image_path}' não encontrado.")
        return

    print(f"\n🚀 Iniciando extração inteligente (Groq Vision) de: {image_path}...")
    
    extracted_data = get_bill_data_from_groq(image_path)

    if not extracted_data:
        print("Não foi possível extrair dados da imagem.")
        return

    print("\n" + "="*30)
    print("📋 DADOS EXTRAÍDOS PELA IA:")
    print(f"Tipo:       {extracted_data.get('type', 'N/A').upper()}")
    print(f"Mês Ref.:   {extracted_data.get('month', 'N/A')}")
    print(f"Vencimento: {extracted_data.get('due_date', 'N/A')}")
    print(f"Valor:      R$ {extracted_data.get('amount', 0.0):.2f}")
    print("="*30)

    confirm = input("\nOs dados estão corretos? Salvar no Supabase? (s/n): ")
    if confirm.lower() == 's':
        save_to_supabase(extracted_data)
    else:
        print("Operação cancelada.")

if __name__ == "__main__":
    main()
