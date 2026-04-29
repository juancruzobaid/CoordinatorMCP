# Security Policy — Desarrollo de Aplicaciones Web

Política de seguridad para proyectos de desarrollo web (Node.js, TypeScript, GitHub, Vercel, Supabase). Aplica a todo el ciclo de desarrollo: código, dependencias, deploy, secrets y accesos.

---

## 1. Gestión de Dependencias

### Versionado
- Fijar versiones exactas en `package.json` (sin `^` ni `~`).
- El `package-lock.json` se commitea siempre al repo. Nunca incluirlo en `.gitignore`.
- Usar `npm ci` como comando estándar de instalación. Reservar `npm install` solo para agregar paquetes nuevos de forma controlada.

### Agregado de dependencias nuevas
- Toda dependencia nueva requiere revisión antes de instalarse.
- Verificar antes de agregar:
  - Que el paquete tenga historial establecido en npm (no es nuevo de horas/días).
  - Que el publisher sea consistente con versiones anteriores.
  - Que el nombre no sea similar a un paquete popular (typosquatting).
  - Que no contenga `postinstall` scripts no documentados.
  - Que tenga mantenimiento activo y repositorio público en GitHub.
- Preferir paquetes con pocos sub-dependencias sobre los que traen árboles enormes.
- Si existe una forma nativa de resolver el problema (API del lenguaje, función propia), preferirla sobre agregar una dependencia.

### Actualizaciones
- Nunca correr `npm update` de forma masiva.
- Actualizar dependencias de a una, revisando changelog y diff antes de aplicar.
- Después de actualizar, verificar que los tests pasen y que el build funcione.

### CI/CD
- Siempre usar `npm ci --ignore-scripts` en pipelines automatizados.
- Si un paquete requiere `postinstall` legítimo, documentarlo en el README y ejecutarlo como paso separado y explícito.

---

## 2. Secrets y Credenciales

### Reglas generales
- Nunca hardcodear secrets en código fuente, configs, ni comentarios.
- Usar variables de entorno para todo: API keys, tokens, passwords, connection strings.
- El archivo `.env` nunca se commitea. Debe estar en `.gitignore` siempre.
- Mantener un `.env.example` en el repo con las variables necesarias (sin valores reales) como referencia.

### Rotación
- Rotar tokens y API keys periódicamente (mínimo cada 6 meses).
- Rotar inmediatamente si:
  - Se sospecha un compromiso de cualquier tipo.
  - Un colaborador deja el proyecto.
  - Un secret se expuso accidentalmente en un commit (aunque se haya revertido, ya está en el historial de git).

### Alcance mínimo (least privilege)
- Cada token o API key debe tener los permisos mínimos necesarios para su función.
- No reusar el mismo token para desarrollo, staging y producción.
- Tokens de CI/CD deben ser específicos para el pipeline, no tokens personales.

---

## 3. Control de Accesos

### GitHub
- Habilitar 2FA (autenticación de dos factores) en la cuenta de GitHub.
- No usar classic personal access tokens de larga duración. Preferir fine-grained tokens con scope limitado y fecha de expiración.
- Revisar periódicamente las GitHub Apps y OAuth apps autorizadas en la cuenta.
- En repos con colaboradores: proteger la rama `main` con branch protection rules (requerir PR, requerir reviews).

### Servicios (Vercel, Supabase, Cloudflare, etc.)
- Habilitar 2FA en todos los servicios.
- Revisar periódicamente los accesos y tokens activos.
- Remover accesos de colaboradores que ya no participan en el proyecto.

---

## 4. Git y Repositorios

### Qué commitear
- Solo código fuente, configs de proyecto, documentación y lock files.
- Nunca commitear: `.env`, secrets, certificados privados, archivos de backup, `node_modules/`.

### .gitignore mínimo recomendado
```
node_modules/
.env
.env.local
.env.*.local
dist/
build/
.next/
.turbo/
.cache/
.vercel/
*.log
.DS_Store
```

### Historial
- Si un secret se commitea por error, no alcanza con revertir el commit. El secret ya está en el historial de git y debe rotarse inmediatamente.
- Considerar usar `git-filter-repo` o BFG Repo Cleaner para limpiar el historial si se expuso algo sensible.

---

## 5. Deploy y Producción

### Variables de entorno
- Configurar secrets de producción directamente en la plataforma de deploy (Vercel, Cloudflare, etc.), nunca en el repo.
- Separar variables por ambiente: development, preview, production.

### Previews y branches
- Los deploys de preview (Vercel) no deben tener acceso a secrets de producción.
- No exponer URLs de preview públicamente si contienen datos sensibles.

### Monitoreo
- Revisar logs de deploy regularmente para detectar errores o comportamiento inusual.
- Configurar alertas de la plataforma de deploy para builds fallidos.

---

## 6. Seguridad en la Máquina de Desarrollo

### Sistema operativo
- Mantener macOS actualizado.
- Habilitar FileVault (encriptación de disco completo).
- Habilitar el firewall del sistema.

### Terminal y herramientas
- No ejecutar scripts descargados de internet sin revisarlos primero.
- No usar `sudo` innecesariamente al instalar paquetes de npm (npm no debería requerir sudo nunca).
- Mantener Node.js y npm actualizados a versiones LTS.

### Redes
- No trabajar con credenciales en redes WiFi públicas sin VPN.
- Preferir conexiones por Tailscale para acceso remoto a servidores propios.

---

## 7. Herramientas de Seguridad Recomendadas

| Herramienta | Función | Costo |
|---|---|---|
| Socket.dev GitHub App | Análisis de dependencias en cada PR | Gratis para repos individuales |
| npm audit | Detección de vulnerabilidades conocidas en dependencias | Incluido en npm |
| GitHub Dependabot | Alertas automáticas de vulnerabilidades y PRs de actualización | Gratis |
| 2FA / Passkeys | Protección de cuentas (GitHub, Vercel, Supabase, Cloudflare) | Gratis |
| Tailscale | Acceso remoto seguro entre dispositivos | Gratis hasta 100 dispositivos |
| FileVault | Encriptación de disco en macOS | Incluido en macOS |

---

## 8. Respuesta a Incidentes

Si se detecta o sospecha un compromiso de seguridad:

1. **No entrar en pánico.** Documentar qué se observó y cuándo.
2. **Aislar.** Si es una dependencia maliciosa, no correr `npm install` hasta verificar.
3. **Verificar.** Usar los comandos de diagnóstico del caso (buscar artefactos, procesos, conexiones sospechosas).
4. **Rotar.** Cambiar inmediatamente todos los secrets que pudieron estar expuestos: npm tokens, API keys, SSH keys, passwords, tokens de CI/CD, y cualquier valor en archivos `.env`.
5. **Limpiar.** Remover la dependencia comprometida, fijar a una versión segura, hacer `npm ci --ignore-scripts`.
6. **Comunicar.** Si el proyecto tiene usuarios o colaboradores, informar del incidente.
7. **Documentar.** Registrar qué pasó, qué se hizo y qué se cambió para referencia futura.

---

## 9. Instrucciones para Claude Code (CLAUDE.md)

Incluir en la raíz de cada repo:

```markdown
# Security Rules

## Dependency Management
- NEVER use `^` or `~` in package.json versions. Always pin exact versions.
- When adding a new dependency, always pin the exact current stable version.
- When running install commands, always use `npm ci` instead of `npm install`.
- In CI/CD scripts and GitHub Actions, always use `npm ci --ignore-scripts`.
- Never run `npm update` without explicit user approval and changelog review.
- Flag any new dependency additions for review before installing.

## Secrets
- Never hardcode secrets, API keys, tokens, or passwords in source code.
- Always use environment variables for sensitive values.
- Never commit .env files to the repository.

## Code Safety
- Never execute scripts downloaded from the internet without review.
- Never use eval() or Function() constructor with dynamic input.
- Sanitize all user inputs before processing.
```

---

*Última actualización: marzo 2026*
