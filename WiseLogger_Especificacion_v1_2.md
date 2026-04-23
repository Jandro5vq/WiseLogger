# WiseLogger — Especificación Funcional y Técnica

**Versión 1.2 · Abril 2025**

> **Cambios v1.2:** Definición explícita de cálculo de tiempo · Timestamps ISO completos · Creación automática de jornada · PWA · Tareas favoritas · Simplificación MCP · Eliminación de complejidad innecesaria

---

## 1. Visión General del Producto

WiseLogger es una aplicación web multi-usuario para el registro y seguimiento del tiempo invertido en la jornada laboral. Se distribuye como un único contenedor Docker autocontenido, sin dependencias externas. Cada usuario dispone de su propio espacio de datos, acceso mediante usuario y contraseña, y una API key personal para integrarse con herramientas de IA mediante el protocolo MCP.

### 1.1 Objetivos

- Registrar con precisión el tiempo real trabajado cada día.
- Asociar tareas concretas a cada jornada con descripción y duración.
- Comparar el tiempo real trabajado con la jornada laboral objetivo.
- Acumular el balance de horas (positivo o negativo) a lo largo del tiempo.
- Ser completamente configurable sin necesidad de tocar código.
- Desplegarse con un único comando Docker, sin base de datos externa.
- Permitir que asistentes de IA consulten y registren datos mediante MCP.
- Instalable como PWA en dispositivos móviles para acceso instantáneo.

### 1.2 Principios de Diseño

- **Minimalista y rápido:** el registro del día debe hacerse en segundos.
- **Mobile-first:** accesible y usable desde el móvil en cualquier momento.
- **Sin fricción:** por defecto propone el día actual, hora actual, etc.
- **Autocontenido:** todo en un solo contenedor, datos persistidos en volumen Docker.
- **Privado y controlado:** nuevos usuarios solo pueden registrarse con invitación del admin.
- **Instalable:** soporte PWA con manifest.json y service worker para experiencia nativa en móvil.
- **Tema oscuro:** soporte nativo de tema claro y oscuro, respetando la preferencia del sistema.

### 1.3 Regla Fundamental de Cálculo de Tiempo

> **El tiempo trabajado se calcula SIEMPRE como la suma de duración de las tareas.** Los campos `start_time` y `end_time` de la jornada son informativos (hora de llegada y salida) pero **nunca se usan para calcular tiempo trabajado.** Los huecos entre tareas se consideran pausas implícitas (comida, descansos, etc.).

💡 Esto elimina la necesidad de un campo `break_minutes` o de modelar pausas explícitamente. El modelo es simple: si no hay tarea activa, no se cuenta tiempo.

---

## 2. Despliegue — Contenedor Docker Único

Toda la aplicación (servidor web, lógica de negocio, base de datos SQLite) se empaqueta en un único contenedor Docker. Los datos persisten en un volumen externo.

### 2.1 Arquitectura del Contenedor

| Componente | Detalle |
|---|---|
| Imagen base | `node:20-alpine` (~50 MB base) |
| Puerto expuesto | 3000 (HTTP) |
| Base de datos | SQLite — fichero único en `/data/wiselogger.db` |
| Volumen de datos | `/data` → contiene la DB y config |
| Proceso único | Next.js standalone (`next start`) con tini como PID 1 |
| Health check | `GET /api/health` → 200 OK |

### 2.2 Arranque Rápido

```bash
docker run -d \
  --name wiselogger \
  -p 3000:3000 \
  -v wiselogger_data:/data \
  -e ADMIN_EMAIL=admin@ejemplo.com \
  -e SECRET_KEY=cambia_esto_por_un_secreto_seguro \
  ghcr.io/tuusuario/wiselogger:latest
```

### 2.3 docker-compose.yml

```yaml
services:
  wiselogger:
    image: ghcr.io/tuusuario/wiselogger:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - wiselogger_data:/data
    environment:
      SECRET_KEY: "cambia_esto_por_un_secreto_seguro"
      ADMIN_EMAIL: "admin@ejemplo.com"
      BASE_URL: "https://wiselogger.midominio.com"
      NODE_ENV: "production"

volumes:
  wiselogger_data:
```

### 2.4 Variables de Entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `SECRET_KEY` | Sí | Clave para firmar JWT. Mínimo 32 caracteres. |
| `ADMIN_EMAIL` | Sí | Email del primer administrador (creado en primer arranque). |
| `BASE_URL` | Recomendada | URL pública. Necesaria para links de invitación. |
| `NODE_ENV` | No | Defecto: `production`. |
| `DB_PATH` | No | Ruta al fichero SQLite. Defecto: `/data/wiselogger.db` |
| `PORT` | No | Puerto interno. Defecto: 3000 |
| `INVITATION_EXPIRY_HOURS` | No | Horas de validez de invitaciones. Defecto: 72 |
| `BACKUP_PATH` | No | Directorio para backups automáticos del SQLite. |
| `BACKUP_CRON` | No | Expresión cron para backup. Defecto: `0 3 * * *` (03:00). |

### 2.5 Estructura interna del Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts/migrate.js ./scripts/

VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "scripts/start.js"]
```

💡 El script `start.js` ejecuta primero las migraciones de base de datos (idempotentes) y después arranca el servidor. Las actualizaciones de imagen aplican cambios de esquema automáticamente.

💡 Se recomienda gestionar HTTPS externamente con un proxy inverso (Nginx, Traefik, Caddy).

---

## 3. Base de Datos — SQLite

SQLite como motor de base de datos. Para uso personal o equipo pequeño (<50 usuarios), ofrece rendimiento más que suficiente sin servidor separado. Se activa WAL mode (`PRAGMA journal_mode=WAL`) para mejorar concurrencia.

### 3.1 Justificación de SQLite

| Aspecto | PostgreSQL | SQLite (elegida) |
|---|---|---|
| Infraestructura | Requiere servidor separado | Fichero único en disco |
| Complejidad Docker | 2+ contenedores | 1 contenedor, listo |
| Backup | pg_dump, replicación... | Copiar el fichero .db |
| Rendimiento 1-20 usuarios | Muy superior al necesario | Más que suficiente |
| Arrays nativos | Sí (`TEXT[]`) | JSON column (equivalente) |
| Concurrencia alta | Excelente | Adecuada (WAL mode) |

### 3.2 ORM y Migraciones

- **ORM:** Drizzle ORM — type-safe, soporte nativo SQLite, sin overhead.
- **Migraciones:** gestionadas con drizzle-kit. Ficheros SQL incluidos en la imagen.
- Las migraciones son idempotentes y se ejecutan en cada arranque.
- El esquema se versiona en el repositorio junto al código.

### 3.3 Nota sobre better-sqlite3

`better-sqlite3` es síncrono y bloquea el event loop de Node.js. Para pocos usuarios no supone problema, pero si el servidor MCP genera ráfagas de queries, podría notarse. **Alternativa a considerar:** `libsql` (fork de SQLite con API asíncrona nativa). Drizzle ORM soporta ambos drivers sin cambios en el esquema.

---

## 4. Autenticación y Gestión de Usuarios

Autenticación mediante usuario y contraseña. El acceso a nuevos usuarios está restringido por enlaces de invitación del administrador.

### 4.1 Roles de Usuario

| Rol | Descripción | Capacidades |
|---|---|---|
| `admin` | Administrador del sistema | Gestión de usuarios, invitaciones, panel admin, + todas las de user. |
| `user` | Usuario estándar | Acceso exclusivo a sus datos: jornadas, tareas, config, API key MCP. |

💡 En el primer arranque, si la tabla de usuarios está vacía, el sistema crea automáticamente una cuenta admin usando `ADMIN_EMAIL` y solicita establecer contraseña en el primer login.

### 4.2 Modelo de Datos — Usuarios

| Columna | Tipo SQLite | Descripción |
|---|---|---|
| `id` | TEXT (UUID) | Identificador único |
| `username` | TEXT UNIQUE NOT NULL | Nombre de usuario para login |
| `email` | TEXT UNIQUE NOT NULL | Email del usuario |
| `password_hash` | TEXT NOT NULL | Hash bcrypt (coste 12) |
| `role` | TEXT NOT NULL | `'admin'` o `'user'`. Defecto: `'user'` |
| `is_active` | INTEGER NOT NULL | 1 = activo, 0 = suspendido. Defecto: 1 |
| `mcp_api_key_hash` | TEXT UNIQUE | Hash de la API key MCP (nunca se almacena en texto plano) |
| `created_at` | TEXT NOT NULL | ISO 8601 timestamp |
| `last_login_at` | TEXT | ISO 8601 timestamp del último acceso |

### 4.3 Sistema de Invitaciones

Para registrarse, un nuevo usuario necesita un enlace de invitación activo generado por el administrador.

**Tabla: `invitations`**

| Columna | Tipo SQLite | Descripción |
|---|---|---|
| `id` | TEXT (UUID) | Identificador del registro |
| `token` | TEXT UNIQUE NOT NULL | Token aleatorio seguro (32 bytes hex) |
| `email` | TEXT | Email destinatario (opcional, informativo) |
| `created_by` | TEXT NOT NULL | FK → `users(id)`. Admin que generó la invitación. |
| `expires_at` | TEXT NOT NULL | ISO 8601. `ahora + INVITATION_EXPIRY_HOURS` |
| `used_at` | TEXT | ISO 8601. NULL si no usada. |
| `used_by` | TEXT | FK → `users(id)`. Usuario que la usó. |

**Flujo de invitación:**

1. Admin accede al panel → sección Invitaciones.
2. Hace clic en 'Generar enlace'. Opcionalmente indica un email.
3. El sistema genera un token y devuelve la URL: `BASE_URL/register?token=<TOKEN>`
4. El admin comparte el enlace con el futuro usuario.
5. El usuario accede al enlace y completa el formulario de registro.
6. El token se marca como usado. No puede reutilizarse.

### 4.4 Sesiones y JWT

- JWT firmados con `SECRET_KEY`, almacenados en cookie `HttpOnly + Secure + SameSite=Strict`.
- Duración: 7 días con renovación automática en cada request.
- Logout: invalida la cookie en el cliente.
- Protección contra usuarios suspendidos: se comprueba `is_active` en cada request autenticado.

💡 Se elimina la tabla de tokens JWT revocados. Para <50 usuarios, comprobar `is_active` en cada request es suficiente y mucho más simple. Si se suspende a un usuario, su sesión deja de funcionar inmediatamente.

### 4.5 Panel de Administración

Accesible solo para usuarios con rol `admin`. Incluye:

- Lista de usuarios registrados (username, email, último acceso, estado).
- Activar / suspender usuarios.
- Resetear contraseña de un usuario (genera enlace temporal de reset).
- Generar nuevos enlaces de invitación con fecha de expiración.
- Ver y revocar invitaciones activas.

💡 Se elimina la recuperación de contraseña por email/SMTP. El admin resetea contraseñas desde el panel. Esto simplifica enormemente el despliegue Docker al no necesitar configuración SMTP.

---

## 5. Módulos Funcionales

Todos los datos son completamente independientes por usuario. Ningún usuario puede ver ni modificar datos de otro.

### 5.1 Módulo de Jornadas

Una jornada (`entry`) representa un día laboral concreto. Es la entidad principal del sistema.

**Tabla: `entries`**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | TEXT (UUID) | Identificador único |
| `user_id` | TEXT NOT NULL | FK → `users(id)` ON DELETE CASCADE |
| `date` | TEXT NOT NULL | Fecha `YYYY-MM-DD` (única por usuario) |
| `start_time` | TEXT NOT NULL | Timestamp ISO 8601 completo (hora de llegada, informativo) |
| `end_time` | TEXT | Timestamp ISO 8601 completo (hora de salida, informativo). NULL si abierta. |
| `expected_minutes` | INTEGER NOT NULL | Minutos objetivo según config del usuario |
| `notes` | TEXT | Notas libres (opcional) |
| `created_at` | TEXT NOT NULL | ISO 8601 |
| `updated_at` | TEXT NOT NULL | ISO 8601 |

**Comportamiento:**

- Al crear una jornada, `start_time` se rellena con el timestamp actual completo (fecha + hora + zona).
- `end_time` queda en NULL hasta que el usuario cierra la jornada.
- `expected_minutes` se calcula según las reglas de jornada del usuario.
- `UNIQUE(user_id, date)`: un usuario no puede tener dos jornadas el mismo día.
- **Tiempo trabajado = suma de duración de las tareas del día (NUNCA `end_time − start_time`).**

> **Creación automática:** Si el usuario añade una tarea sin haber iniciado la jornada del día, el sistema la crea automáticamente con `start_time = ahora` y `expected_minutes` según su configuración. Esto elimina fricción y permite el flujo "solo tareas".

💡 Botón de inicio rápido en el dashboard: crea la jornada del día con un solo toque. Pero NO es obligatorio usarlo — crear una tarea tiene el mismo efecto.

### 5.2 Módulo de Tareas

Cada tarea está vinculada a una jornada. Representa un bloque de trabajo con descripción y duración.

**Tabla: `tasks`**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | TEXT (UUID) | Identificador único |
| `entry_id` | TEXT NOT NULL | FK → `entries(id)` ON DELETE CASCADE |
| `user_id` | TEXT NOT NULL | FK → `users(id)` — desnormalizado para queries |
| `start_time` | TEXT NOT NULL | Timestamp ISO 8601 completo |
| `end_time` | TEXT | Timestamp ISO 8601 completo. NULL si activa. |
| `description` | TEXT NOT NULL | Descripción de lo realizado |
| `tags` | TEXT | JSON array: `'["dev","reunión"]'` |
| `created_at` | TEXT NOT NULL | ISO 8601 |
| `updated_at` | TEXT NOT NULL | ISO 8601 |

**Reglas de negocio:**

- Solo puede haber una tarea activa (sin `end_time`) por usuario al mismo tiempo.
- La suma de duración de tareas puede superar la jornada objetivo.
- CONSTRAINT: `entry_id` referencia a una jornada del mismo `user_id`.
- Los tags se almacenan como JSON en SQLite (TEXT column).

> **Timestamps completos:** Tanto `start_time` como `end_time` son timestamps ISO 8601 con fecha, hora y zona horaria (ej: `2025-04-08T09:30:00+02:00`). Esto permite manejar correctamente tareas que cruzan medianoche (guardias, trabajo nocturno) y elimina ambigüedades de zona horaria.

### 5.3 Tareas Favoritas / Recientes

Para reducir fricción en móvil, el sistema mantiene una lista de las descripciones de tareas más usadas por cada usuario.

- Al crear una nueva tarea, se muestra un desplegable con las 10 descripciones más frecuentes del usuario.
- El usuario puede seleccionar una descripción existente (con sus tags habituales) o escribir una nueva.
- No requiere tabla adicional: se calcula con un `GROUP BY` sobre la tabla `tasks`.

💡 Esto ahorra escritura significativa en móvil, donde teclear es el mayor punto de fricción.

---

## 6. Módulo de Configuración de Jornada

Cada usuario tiene su propia configuración. Las reglas se aplican en orden de prioridad: **Fecha concreta → Mes completo → Día de la semana → Duración por defecto.**

**Tabla: `work_schedule_rules`**

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | TEXT (UUID) | Identificador de la regla |
| `user_id` | TEXT NOT NULL | FK → `users(id)` ON DELETE CASCADE |
| `rule_type` | TEXT NOT NULL | `'default'` \| `'weekday'` \| `'month'` \| `'date'` |
| `weekday` | INTEGER | 0=lunes…6=domingo (solo `weekday`) |
| `month` | INTEGER | 1=enero…12=diciembre (solo `month`) |
| `specific_date` | TEXT | `YYYY-MM-DD` (solo `date`) |
| `duration_minutes` | INTEGER NOT NULL | Duración en minutos. 0 = no laborable. |
| `label` | TEXT NOT NULL | Etiqueta descriptiva |

**Configuración por defecto (nuevos usuarios):**

| Tipo | Condición | Duración | Etiqueta |
|---|---|---|---|
| `default` | — | 8h 15m (495 min) | Jornada estándar |
| `weekday` | Viernes (4) | 6h 15m (375 min) | Jornada reducida viernes |
| `month` | Agosto (8) | 6h 15m (375 min) | Jornada de verano |

### 6.1 Recálculo automático de balance

Cuando se edita una jornada pasada o se modifican las reglas de configuración, el sistema **recalcula automáticamente el balance acumulado** desde la fecha afectada hasta hoy. No se mantiene un log de cambios en v1, pero el balance siempre refleja el estado actual de los datos.

---

## 7. Pantallas y Flujos de Usuario

### 7.1 Login y Registro

- Pantalla de login: campos username + contraseña.
- Pantalla de registro: solo accesible desde enlace de invitación válido. Mensaje de error claro si token inválido o expirado.
- Redirección automática al dashboard tras login exitoso.

💡 Sin recuperación de contraseña por email. El admin resetea contraseñas desde el panel de administración.

### 7.2 Dashboard / Hoy

Pantalla principal. Muestra el estado del día actual de forma compacta.

**Widget de estado mínimo (zona superior) — solo 3 datos clave, siempre visibles:**

- Tiempo trabajado hoy (suma de tareas).
- Balance del día (diferencia vs objetivo).
- Balance acumulado histórico.

**Contenido del dashboard:**

| Elemento | Descripción |
|---|---|
| Encabezado del día | Fecha, día semana, jornada objetivo (ej. 8h 15m) |
| Barra de progreso | Tiempo trabajado vs objetivo. Verde al alcanzar. |
| Tarea activa | Cronómetro en tiempo real si hay tarea en curso. |
| Lista tareas del día | Hora inicio, fin, duración, descripción, tags. |
| Botón 'Nueva tarea' | Formulario rápido con desplegable de favoritas. |
| Botón 'Cerrar jornada' | Registra `end_time` con la hora actual. |

### 7.3 Historial / Calendario

- Calendario mensual con indicadores de color.
- Click en un día abre el detalle con sus tareas.
- Navegación por semana, mes o lista.
- Edición de jornadas y tareas pasadas (recalcula balance automáticamente).

### 7.4 Resúmenes y Estadísticas

| Métrica | Descripción |
|---|---|
| Tiempo total trabajado | Suma del período seleccionado |
| Tiempo objetivo total | Suma de jornadas objetivo del período |
| Balance del período | Diferencia total (+/−) |
| Balance acumulado histórico | Suma de todos los balances hasta la fecha |
| Media diaria de horas | Tiempo medio trabajado por día |
| Distribución por tags | Porcentaje de tiempo por categoría |
| Heatmap de actividad | Mapa de calor tipo GitHub de intensidad |

### 7.5 Configuración de Usuario

- Gestión de reglas de jornada personales.
- Cambio de contraseña.
- Preferencias: formato de hora, zona horaria, tema (claro/oscuro/sistema).
- Gestión de tags disponibles.
- Sección API Key MCP: visualizar, regenerar la API key personal.
- Exportar datos personales (CSV, JSON).

---

## 8. Stack Técnico

| Capa | Tecnología | Justificación |
|---|---|---|
| Framework | Next.js 14 + TypeScript | Full-stack, App Router, output standalone para Docker |
| UI / Estilos | Tailwind CSS + shadcn/ui | Componentes accesibles, dark mode nativo, sin build externo |
| Base de datos | SQLite (`better-sqlite3` o `libsql`) | Fichero único, sin servidor, perfecto para single-container |
| ORM | Drizzle ORM | Type-safe, soporte SQLite nativo, migraciones simples |
| Autenticación | JWT + bcrypt (propio) | Sin dependencias externas de auth, control total |
| Gráficos | Recharts | Librería React ligera, bien mantenida |
| Servidor MCP | `@modelcontextprotocol/sdk` | SDK oficial del protocolo MCP sobre SSE/HTTP |
| PWA | `next-pwa` o manual | manifest.json + service worker para instalación móvil |
| Contenedor | Docker (alpine) | Imagen final ~150 MB, arranque < 2s |

💡 Next.js con `output: 'standalone'` genera una carpeta con solo los ficheros necesarios, sin `node_modules` completo. Reduce significativamente la imagen Docker.

---

## 9. Modelo de Datos Completo (SQLite)

### Diagrama de Entidades

```
users (1) ──────────── tiene ────────> (N) entries
users (1) ──────────── tiene ────────> (N) schedule_rules
users (1) ──────────── tiene ────────> (1) mcp_api_key_hash
entries (1) ─────────── contiene ────> (N) tasks
invitations (N) ────── creadas por ──> (1) users [admin]
invitations (1) ────── usada por ────> (0..1) users
```

### Tabla: `users`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK, UUID |
| `username` | TEXT | UNIQUE NOT NULL |
| `email` | TEXT | UNIQUE NOT NULL |
| `password_hash` | TEXT | NOT NULL |
| `role` | TEXT | NOT NULL DEFAULT `'user'` CHECK IN (`'admin'`,`'user'`) |
| `is_active` | INTEGER | NOT NULL DEFAULT 1 |
| `mcp_api_key_hash` | TEXT | UNIQUE, hash de `crypto.randomBytes(32)` |
| `created_at` | TEXT | NOT NULL |
| `last_login_at` | TEXT | NULL |

### Tabla: `invitations`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK, UUID |
| `token` | TEXT | UNIQUE NOT NULL |
| `email` | TEXT | NULL |
| `created_by` | TEXT | NOT NULL, FK → `users(id)` |
| `expires_at` | TEXT | NOT NULL |
| `used_at` | TEXT | NULL |
| `used_by` | TEXT | NULL, FK → `users(id)` |

### Tabla: `entries`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK, UUID |
| `user_id` | TEXT | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `date` | TEXT | NOT NULL, `YYYY-MM-DD`, UNIQUE con `user_id` |
| `start_time` | TEXT | NOT NULL, ISO 8601 completo |
| `end_time` | TEXT | NULL, ISO 8601 completo |
| `expected_minutes` | INTEGER | NOT NULL |
| `notes` | TEXT | NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### Tabla: `tasks`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK, UUID |
| `entry_id` | TEXT | NOT NULL, FK → `entries(id)` ON DELETE CASCADE |
| `user_id` | TEXT | NOT NULL, FK → `users(id)` |
| `start_time` | TEXT | NOT NULL, ISO 8601 completo |
| `end_time` | TEXT | NULL, ISO 8601 completo |
| `description` | TEXT | NOT NULL |
| `tags` | TEXT | NULL, JSON array |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

### Tabla: `work_schedule_rules`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | TEXT | PK, UUID |
| `user_id` | TEXT | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `rule_type` | TEXT | NOT NULL CHECK IN (`'default'`,`'weekday'`,`'month'`,`'date'`) |
| `weekday` | INTEGER | NULL, 0–6 |
| `month` | INTEGER | NULL, 1–12 |
| `specific_date` | TEXT | NULL, `YYYY-MM-DD` |
| `duration_minutes` | INTEGER | NOT NULL CHECK >= 0 |
| `label` | TEXT | NOT NULL |

---

## 10. API REST — Endpoints Principales

Todos los endpoints (excepto `/api/auth/*` y `/api/register`) requieren sesión activa. Cada usuario solo accede a sus propios recursos. El `user_id` se extrae del JWT, nunca se expone en la URL.

### 10.1 Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login. Body: `{username, password}`. JWT en cookie. |
| POST | `/api/auth/logout` | Logout. Invalida la cookie. |
| GET | `/api/auth/me` | Datos del usuario autenticado. |
| POST | `/api/register` | Registro con token de invitación. |

### 10.2 Administración

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/admin/users` | Listar todos los usuarios. |
| PATCH | `/api/admin/users/:id` | Activar/suspender usuario. |
| POST | `/api/admin/users/:id/reset-password` | Genera enlace temporal de reset de contraseña. |
| GET | `/api/admin/invitations` | Listar invitaciones. |
| POST | `/api/admin/invitations` | Generar nuevo enlace de invitación. |
| DELETE | `/api/admin/invitations/:id` | Revocar invitación no usada. |

### 10.3 Jornadas, Tareas, Resúmenes y Configuración

| Área | Endpoints principales |
|---|---|
| Jornadas | `GET/POST /api/entries` · `GET/PATCH/DELETE /api/entries/:id` · `POST /api/entries/today/close` |
| Tareas | `GET/POST /api/entries/:id/tasks` · `PATCH/DELETE /api/tasks/:id` · `POST /api/tasks/:id/stop` |
| Favoritas | `GET /api/tasks/favorites` (top 10 descripciones más usadas) |
| Resúmenes | `GET /api/summary/day/:date` · `/week` · `/month` · `/range` · `/balance` |
| Configuración | `GET/POST/PATCH/DELETE /api/schedule-rules` · `GET /api/schedule-rules/resolve` |

---

## 11. Servidor MCP — Integración con IA

MCP (Model Context Protocol) es un protocolo abierto de Anthropic que permite a modelos de IA interactuar con herramientas y datos externos de forma estandarizada.

### 11.1 Concepto

Cada usuario dispone de una API key personal. Con esta key, puede configurar un servidor MCP en su cliente de IA favorito (GitHub Copilot, Claude, Cursor) e interactuar con sus datos en lenguaje natural.

**Ejemplos de interacciones:**

- «¿Cuántas horas he trabajado esta semana?»
- «Registra una tarea de 45 minutos: revisión del PR de autenticación»
- «Inicia la jornada de hoy»
- «Cierra la tarea que tengo activa»

### 11.2 Endpoint

| Aspecto | Detalle |
|---|---|
| URL base | `BASE_URL/mcp` |
| Autenticación | Header: `Authorization: Bearer <mcp_api_key>` |
| Transporte | HTTP + SSE (Server-Sent Events) |
| Protocolo | MCP 1.0 (JSON-RPC 2.0 sobre SSE) |
| Aislamiento | Cada API key da acceso únicamente a datos de su usuario |

### 11.3 Tools MCP — v1 (Core)

Para la v1, se exponen **5 tools esenciales**. Esto reduce la superficie de implementación y testeo. Las tools adicionales se añadirán en fases posteriores.

| Tool | Descripción | Parámetros |
|---|---|---|
| `get_today_summary` | Resumen completo del día: jornada, tareas, balance. | ninguno |
| `start_day` | Inicia la jornada del día actual. | `start_time?` (HH:MM) |
| `close_day` | Cierra la jornada actual. | `end_time?` (HH:MM) |
| `add_task` | Añade una tarea a la jornada de hoy. | `description`, `start_time?`, `end_time?`, `tags?` |
| `stop_active_task` | Detiene la tarea actualmente en curso. | `end_time?` (HH:MM) |

### 11.4 Tools MCP — v2 (Futuras)

| Tool | Descripción |
|---|---|
| `get_week_summary` | Resumen de la semana actual o concreta. |
| `get_month_summary` | Resumen mensual. |
| `get_balance` | Balance acumulado de horas hasta hoy. |
| `list_tasks` | Lista tareas de un día. |
| `get_active_task` | Devuelve la tarea activa, si existe. |
| `search_tasks` | Busca tareas por texto o tags en un rango de fechas. |

### 11.5 Recursos MCP (Resources) — v2

Se implementarán en fase posterior:

- `wiselogger://today` — Estado completo del día actual.
- `wiselogger://week` — Resumen de la semana en curso.
- `wiselogger://balance` — Balance acumulado de horas.
- `wiselogger://config` — Configuración de jornada del usuario.

### 11.6 Configuración en Clientes IA

**GitHub Copilot (VS Code):**

```json
// .vscode/mcp.json
{
  "servers": {
    "wiselogger": {
      "type": "http",
      "url": "https://wiselogger.midominio.com/mcp",
      "headers": {
        "Authorization": "Bearer wl_tu_api_key_aqui"
      }
    }
  }
}
```

**Claude Desktop:**

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "wiselogger": {
      "transport": {
        "type": "http",
        "url": "https://wiselogger.midominio.com/mcp",
        "headers": {
          "Authorization": "Bearer wl_tu_api_key_aqui"
        }
      }
    }
  }
}
```

**Cursor:**

```json
{
  "wiselogger": {
    "url": "https://wiselogger.midominio.com/mcp",
    "apiKey": "wl_tu_api_key_aqui"
  }
}
```

### 11.7 Gestión de la API Key

- Generada automáticamente al crear la cuenta (formato: `wl_` + 64 chars hex).
- Visible en configuración personal. Solo se muestra en texto plano al generar/regenerar.
- Se almacena hasheada en la base de datos (columna `mcp_api_key_hash`).
- Regenerar invalida inmediatamente la anterior.
- Solo permite operaciones de lectura/escritura de datos propios. No admin.
- 401 sin información adicional ante API key inválida.

---

## 12. PWA (Progressive Web App)

Para cumplir con el principio mobile-first, la aplicación se configura como PWA:

- `manifest.json` con nombre, iconos y `theme_color`.
- Service worker básico para caché de assets estáticos (offline shell).
- Prompt de instalación en móvil ("Añadir a pantalla de inicio").
- Funciona offline para mostrar el último estado cacheado del dashboard.

💡 El coste de implementación es mínimo con Next.js (paquete `next-pwa` o configuración manual) y el valor para la experiencia móvil es muy alto.

---

## 13. Funcionalidades Adicionales

### 13.1 Timer en tiempo real

- Cronómetro persistente aunque se cierre y reabra el navegador (basado en `start_time` de la tarea activa).
- Notificación cuando se alcanza la duración objetivo de la jornada.

### 13.2 Balance acumulado

- Registro continuo de horas de más o de menos.
- Opción de resetear el balance en una fecha determinada.
- Recálculo automático al editar jornadas pasadas.

### 13.3 Exportación

- CSV compatible con Excel.
- JSON para backup completo personal.

💡 El informe PDF mensual queda pospuesto a fases futuras. Alto coste de implementación con bajo uso esperado.

### 13.4 Atajos de teclado

`N` → nueva tarea · `S` → detener tarea activa · `C` → cerrar jornada · `/` → buscar

### 13.5 Backup automático

- Copia del fichero SQLite a directorio externo según `BACKUP_CRON`.
- Variables `BACKUP_PATH` y `BACKUP_CRON` para configurar sin tocar código.

### 13.6 Tema oscuro

- Soporte nativo de tema claro, oscuro y automático (sigue preferencia del sistema).
- Tailwind CSS `dark:` variant + CSS custom properties para shadcn/ui.
- La preferencia se guarda en `localStorage` del usuario.

---

## 14. Hoja de Ruta Sugerida

| Fase | Contenido | Tiempo estimado |
|---|---|---|
| **Fase 1 – Base** | Docker + SQLite + Auth (login, registro con invitación, JWT). Panel admin básico. PWA shell. | 2-3 semanas |
| **Fase 2 – MVP Core** | Jornadas y tareas (con creación automática). Dashboard de hoy. Config de jornada. Tareas favoritas. | 2 semanas |
| **Fase 3 – Historial** | Calendario mensual. Edición de días pasados con recálculo de balance. Vista lista. | 1-2 semanas |
| **Fase 4 – Análisis** | Resúmenes, balance acumulado, gráficos, heatmap. Tema oscuro. | 1-2 semanas |
| **Fase 5 – MCP v1** | Servidor MCP con 5 tools core. API keys. Tests con Copilot/Claude. | 1-2 semanas |
| **Fase 6 – UX y Extras** | Timer tiempo real, atajos teclado, exportación CSV/JSON, backup automático. | 1-2 semanas |
| **Fase 7 – MCP v2** | Tools adicionales (resumen semana/mes, búsqueda), Resources MCP. | 1 semana |

---

## 15. Resumen de Cambios v1.1 → v1.2

| Área | Cambio | Motivo |
|---|---|---|
| Cálculo de tiempo | Definición explícita: tiempo = suma de tareas | Elimina ambigüedad crítica |
| Timestamps | `HH:MM` → ISO 8601 completo en tareas y jornadas | Soporte trabajo nocturno, zonas horarias |
| Creación jornada | Automática al añadir primera tarea | Reduce fricción, permite flujo "solo tareas" |
| Tareas favoritas | Top 10 descripciones más usadas en formulario | Input rápido en móvil |
| PWA | manifest.json + service worker | Experiencia mobile-first real |
| Tema oscuro | Soporte nativo claro/oscuro/sistema | UX esencial para uso diario |
| JWT blacklist | Eliminada. Se comprueba `is_active` en cada request | Simplificación sin pérdida de seguridad |
| SMTP / email | Eliminado. Admin resetea contraseñas | Simplifica despliegue Docker |
| Rate limiting MCP | Eliminado en v1 | Innecesario para <50 usuarios |
| PDF export | Pospuesto a fases futuras | Alto coste, bajo uso esperado |
| MCP tools | Reducidas de 11 a 5 en v1 | Menor superficie de implementación |
| MCP Resources | Pospuestos a v2 | Priorizar tools core |
| `mcp_api_key` | Renombrado a `mcp_api_key_hash` | Refleja que se almacena hasheada |
| `updated_at` en tasks | Añadido | Consistencia con tabla entries |
| Recálculo balance | Automático al editar jornadas pasadas | Integridad de datos |
| better-sqlite3 | Nota sobre alternativa libsql | Prevención de bloqueo event loop |
| Nombre del proyecto | WorkLog → **WiseLogger** | Rebranding |

---

## 16. Notas Finales

Este documento es una especificación viva. Se recomienda revisarlo y adaptarlo durante el desarrollo.

**Decisiones ya tomadas en v1.2:**

- No se necesita recuperación de contraseña por email. El admin resetea desde el panel.
- La API MCP tiene lectura y escritura por defecto.
- SQLite es adecuado hasta ~50 usuarios concurrentes.
- HTTPS se gestiona externamente con proxy inverso.

---

*— Fin del documento —*
