import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// new Date().toISOString().split('T')[0] da el día en UTC y desfasa después de
// las 6 pm en México. La compartimos con eslint.critico.config.js.
export const PROHIBIR_FECHA_UTC = ['error', {
  selector: "CallExpression[callee.property.name='split'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
  message: "toISOString().split da el día en UTC: usa hoyMexico() de src/lib/fechas.js.",
}]

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-restricted-syntax': PROHIBIR_FECHA_UTC,
      // Las pantallas cargan sus datos con useEffect(() => { fetchX() }), que llama
      // setState: la regla lo marca en todas. Queda como aviso, no como error.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
