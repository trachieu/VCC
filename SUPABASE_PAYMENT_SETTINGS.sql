-- V16.39: Chạy MỘT LẦN trong Supabase SQL Editor.
-- Một cấu hình chuyển khoản dùng chung cho toàn bộ website.
CREATE TABLE IF NOT EXISTS public.payment_settings (
 id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 bank_bin text NOT NULL CHECK (bank_bin ~ '^[0-9]{6}$'),
 bank_name text NOT NULL CHECK (char_length(bank_name) BETWEEN 2 AND 100),
 account_number text NOT NULL CHECK (account_number ~ '^[0-9]{4,25}$'),
 account_name text NOT NULL CHECK (char_length(account_name) BETWEEN 1 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Giữ thông tin QR đã có trong phiên bản V16.37, Admin có thể đổi ngay trên web.
INSERT INTO public.payment_settings (id,bank_bin,bank_name,account_number,account_name)
VALUES (1,'970432','VPBank','316666663','CU THANH TUNG')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_settings TO authenticated;
GRANT UPDATE (bank_bin,bank_name,account_number,account_name,updated_at) ON public.payment_settings TO authenticated;
DROP POLICY IF EXISTS payment_settings_read ON public.payment_settings;
CREATE POLICY payment_settings_read ON public.payment_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS payment_settings_admin_update ON public.payment_settings;
CREATE POLICY payment_settings_admin_update ON public.payment_settings FOR UPDATE TO authenticated
 USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));

-- Chỉ Admin được cập nhật, tự ghi mốc cập nhật.
CREATE OR REPLACE FUNCTION public.touch_payment_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS payment_settings_updated_at ON public.payment_settings;
CREATE TRIGGER payment_settings_updated_at BEFORE UPDATE ON public.payment_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_payment_settings();
