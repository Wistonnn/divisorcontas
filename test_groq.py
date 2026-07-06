import os
import sys
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

key = os.getenv("GROQ_API_KEY")
if not key:
    print("ERRO: GROQ_API_KEY nao encontrada no .env!")
    sys.exit(1)

print(f"Chave encontrada, comeca com: {key[:8]}...")

try:
    client = Groq()
    import base64
    with open('test.jpg', 'rb') as f:
        base64_image = base64.b64encode(f.read()).decode('utf-8')
    completion = client.chat.completions.create(
        model="llama-3.2-11b-vision-preview",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract text"},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ]
            }
        ],
        temperature=0,
        max_tokens=10,
    )
    print("SUCESSO AI:", completion.choices[0].message.content)
except Exception as e:
    import traceback
    traceback.print_exc()
