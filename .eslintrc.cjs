// ESLint 8 系（eslintrc 形式）の設定。
// electron-vite の react-ts テンプレートが前提にしている構成に素直に従う。
// - @electron-toolkit/eslint-config-ts/recommended … TS パーサ + @typescript-eslint 推奨
// - @electron-toolkit/eslint-config-prettier        … prettier との整合（prettier/prettier ルール）
// - plugin:react/recommended, plugin:react/jsx-runtime … React 用（新 JSX 変換前提）
// ※ ブロックコメントの先頭を「eslint」で始めるとインライン設定ディレクティブと誤認されるため行コメントにしている
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    '@electron-toolkit/eslint-config-ts/recommended',
    '@electron-toolkit/eslint-config-prettier'
  ],
  settings: {
    react: {
      version: 'detect'
    }
  },
  rules: {
    // 整形（prettier）と検査（eslint）を分離する。
    // eslint にはバグ検出に専念させ、整形の乱れは指摘させない。
    // ※ @electron-toolkit/eslint-config-prettier は extends から外さないこと。
    //    この設定は「eslint 内蔵の整形ルールを黙らせる役」も兼ねており、
    //    丸ごと外すと内蔵の整形ルールが復活して別のノイズが出る。
    //    そのため extends には残したまま、この 1 ルールだけを off にするのが正解。
    'prettier/prettier': 'off',

    // 既存コードは「戻り値型を明示しない」方針で統一されており、
    // 型の安全性は typecheck（tsc --noEmit）が既に担保している。
    '@typescript-eslint/explicit-function-return-type': 'off',

    // アンダースコア始まりの識別子は「意図的に使わない」印として扱う。
    // 例：DictManagerApp.tsx の `const [_priorityOrder, setPriorityOrder] = useState(...)`
    //     ＝ setter だけを使い、値そのものは参照しない state。値は未使用だが削除できない
    //     （setter と対で存在するため）。これを未使用と誤検知させないための除外。
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }
    ]
  },
  overrides: [
    {
      // 【免除の理由】BOM 除去の正規表現に U+FEFF（不可視の特殊空白）を含んでいる。
      // no-irregular-whitespace はこれを「不正な空白」として指摘するが、
      // 消すと BOM 付きファイルの読み込みが壊れる（＝辞書データの読込/保存に直結）。
      // DictManager は「データ消失に直結する領域」であり、掃除目的で触らないと決めている。
      // そのため、コード内に eslint-disable コメントを書き足すのではなく、
      // ファイル自体に一切触れずに済むこの overrides で免除する。
      files: ['src/shared/dict/DictManager.ts'],
      rules: {
        'no-irregular-whitespace': 'off'
      }
    },
    {
      // 【免除の理由】preload 側で定義した型を renderer から参照するための
      // triple-slash reference（/// <reference ... />）を意図的に使っている。
      // 外すと renderer 側の window.api の型解決が壊れる。
      // ここも該当ファイルに触れずに済むよう overrides で免除する。
      files: ['src/renderer/env.d.ts'],
      rules: {
        '@typescript-eslint/triple-slash-reference': 'off'
      }
    }
  ],
  ignorePatterns: ['node_modules', 'dist', 'out', 'build']
}
