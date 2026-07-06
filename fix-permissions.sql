-- Execute no SQL Editor do Supabase para configurar RLS para usuários autenticados

-- 1. Remove todas as políticas existentes
DO $$
BEGIN
  DROP POLICY IF EXISTS "Enable read access for all users" ON public.bills;
  DROP POLICY IF EXISTS "Enable read access for all users" ON public.payments;
  DROP POLICY IF EXISTS "Enable insert for anon users" ON public.bills;
  DROP POLICY IF EXISTS "Enable insert for anon users" ON public.payments;
  DROP POLICY IF EXISTS "Anon can select bills" ON public.bills;
  DROP POLICY IF EXISTS "Anon can select payments" ON public.payments;
  DROP POLICY IF EXISTS "Anon can insert bills" ON public.bills;
  DROP POLICY IF EXISTS "Anon can insert payments" ON public.payments;
  DROP POLICY IF EXISTS "select_bills_anon" ON public.bills;
  DROP POLICY IF EXISTS "select_payments_anon" ON public.payments;
  DROP POLICY IF EXISTS "insert_bills_anon" ON public.bills;
  DROP POLICY IF EXISTS "insert_payments_anon" ON public.payments;
END$$;

-- 2. Cria políticas para usuários AUTENTICADOS (muito mais seguro)
CREATE POLICY "auth_select_bills" ON public.bills
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_select_payments" ON public.payments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_bills" ON public.bills
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_insert_payments" ON public.payments
  FOR INSERT TO authenticated WITH CHECK (true);
