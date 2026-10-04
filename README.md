# Nido lactancia

Web para anotar tomas y pañales, compartida entre dos personas. Sin configurar Supabase, la página guarda los datos en el navegador. Con Supabase, los datos viven en Postgres y los ven los dos teléfonos.

Cada teléfono guarda la sesión en el navegador. Al volver a abrir la página no pide la contraseña, hasta que alguien toca Salir o borra los datos del sitio.

## Correr en local

1. Creá un proyecto en [Supabase](https://supabase.com).
2. Authentication → Providers → Email: dejalo activo y apagá **Confirm email**.
3. En el SQL Editor, ejecutá en orden:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_rpc.sql`
4. Copiá `.env.example` a `.env.local` y completá la Project URL y la anon key.
5. Instalá y levantá la app:

```bash
npm install
npm test
npm run dev
```

El usuario se escribe sin `@`. Por dentro la cuenta es `usuario@nido-lactancia.local`. La contraseña la guarda Supabase, hasheada. No hay email real, así que recuperar la clave se hace desde el dashboard de Supabase (Authentication → Users).

La primera persona elige **Crear familia** y le pasa el código a la otra. La segunda se registra y elige **Tengo un código**.

## Qué se guarda

| Dato | Dónde |
|---|---|
| Tomas, pañales, bebés, familia | Postgres de Supabase, hora en UTC |
| Contraseña | Auth de Supabase |
| Sesión | `localStorage` del navegador |
| La página | GitHub Pages, cuando la publiques |

En pantalla, la hora es la del dispositivo.

## Publicar en GitHub Pages

Settings → Pages → Source: GitHub Actions. El workflow `.github/workflows/deploy-pages.yml` corre los tests y publica `main`. El build lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Con esas dos variables, la página publicada guarda en Supabase. Sin ellas, guarda solo en el navegador.

El proyecto gratis de Supabase se pausa si nadie entra durante 7 días. Hay que restaurarlo desde el dashboard.
