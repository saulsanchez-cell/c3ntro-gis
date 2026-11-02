// Revisión crítica (bloquea el PR en GitHub Actions): solo reglas que siempre
// son un error real. La revisión completa (eslint.config.js) también corre,
// pero solo informa mientras tenga errores previos.
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import { PROHIBIR_FECHA_UTC } from './eslint.config.js'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    // react-refresh se registra sin reglas: algún eslint-disable la menciona
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Las reglas de la configuración completa que aquí no se revisan no deben
    // quejarse si un comentario de eslint-disable las menciona
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-undef': 'error',                      // p. ej. un componente sin importar
      'react-hooks/rules-of-hooks': 'error',    // p. ej. un useState después de un return
      'no-restricted-syntax': PROHIBIR_FECHA_UTC,
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-const-assign': 'error',
      'no-self-assign': 'error',
    },
  },
])
