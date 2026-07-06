-- SCRIPTS SQL PARA O SUPABASE

-- 1. Cria a tabela de Contas (Luz e Água)
CREATE TABLE IF NOT EXISTS public.bills (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    type text NOT NULL CHECK (type IN ('luz', 'agua')),
    month text NOT NULL,
    due_date text NOT NULL,
    amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Cria a tabela de Entradas (Pagamentos da Paula)
CREATE TABLE IF NOT EXISTS public.payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    date text NOT NULL,
    amount numeric NOT NULL,
    description text DEFAULT 'Pagamento Paula',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Habilita o acesso anônimo RLS (Row Level Security) para testes fáceis (Depois você pode fechar)
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.bills FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.payments FOR SELECT USING (true);

-- 4. Insere os dados de teste baseados na sua planilha de Fevereiro
INSERT INTO public.bills (type, month, due_date, amount) VALUES
('luz', 'Dezembro', '07/12', 701.40),
('luz', 'Janeiro', '07/01', 691.00),
('luz', 'Fevereiro', '07/02', 569.44),
('luz', 'Março', '07/03', 690.54),
('luz', 'Abril', '07/04', 631.94),
('agua', 'Dezembro', '17/12', 169.73),
('agua', 'Janeiro', '17/01', 224.84),
('agua', 'Fevereiro', '17/02', 191.50);

INSERT INTO public.payments (date, amount) VALUES
('Inicial', 4.90),
('22/01', 200.00),
('06/02', 100.00),
('15/02', 224.98),
('20/02', 300.00),
('23/02', 150.00),
('20/03', 200.00);
