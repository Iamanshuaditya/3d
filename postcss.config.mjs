const config = {
  plugins: {
    // The repository contains binary geometry research under /experiments.
    // Limit Tailwind candidate discovery to application source so arbitrary
    // byte sequences can never be interpreted as utility class names.
    "@tailwindcss/postcss": { base: "./src" },
  },
};

export default config;
