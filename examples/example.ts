// TypeScript example with inline color values and Tailwind HSL format

interface Theme {
  primary: string;
  secondary: string;
  background: string;
}

const lightTheme: Theme = {
  primary: '#3b82f6',
  secondary: 'rgb(168, 85, 247)',
  background: 'hsl(0 0% 100%)',
};

const darkTheme: Theme = {
  primary: '#60a5fa',
  secondary: 'rgba(192, 132, 252, 0.9)',
  background: 'hsl(222 47% 11%)',
};

// Tailwind CSS variable format (compact HSL)
const tailwindColors = {
  slate: '215 20% 65%',
  purple: '270 75% 60% / 0.8',
  emerald: '160 84% 39%',
  rose: '350 89% 60%',
};

// Chart colors with various formats
const chartPalette = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  'rgb(59, 130, 246)',
  'hsl(280 87% 65%)',
  '338 70% 50%',
];

// Component styling
const buttonStyles = {
  base: 'bg-[#ffffff] text-[#1f2937]',
  primary: 'bg-[rgb(59,130,246)] hover:bg-[#2563eb]',
  danger: 'bg-[hsl(0 84% 60%)] text-[#ffffff]',
  custom: 'border-[214 31% 91%] shadow-[rgba(0,0,0,0.1)]',
};

// Card component example
const CardComponent = `
  <div class="bg-card text-card-foreground border-border rounded-lg shadow-sm">
    <div class="bg-primary text-primary-foreground p-4">
      <h2 class="text-xl font-bold">Color Preview Card</h2>
    </div>
    <div class="p-6">
      <p class="text-muted-foreground mb-4">
        This card demonstrates Tailwind classes themed with CSS variables.
      </p>
      <button class="bg-primary hover:bg-[#2563eb] text-primary-foreground px-4 py-2 rounded-md ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
        Primary Button
      </button>
      <button class="bg-destructive hover:bg-[rgba(239,68,68,0.9)] text-destructive-foreground px-4 py-2 rounded-md ml-2">
        Danger Button
      </button>
      <button class="bg-secondary text-secondary-foreground hover:bg-[210 40% 92%] px-4 py-2 rounded-md ml-2">
        Secondary
      </button>
    </div>
    <div class="bg-muted border-t border-border p-4">
      <span class="text-muted-foreground">Footer using theme variables</span>
      <div class="mt-2 flex gap-2">
      <div class="w-8 h-8 rounded plums" title="plums">Hello</div>
      <div class="w-8 h-8 rounded plask" title="plask">Hello</div>
      <div class="w-8 h-8 rounded bonk" title="bonk">Hello</div>
      <div class="w-8 h-8 rounded hardcoded" title="hardcoded">Hello</div>
      <div class="w-8 h-8 rounded hardcoded-rgb" title="hardcoded-rgb">Hello</div>
      <div class="w-8 h-8 rounded bg-[var(--chart-1)]" title="blrpf"></div>
        <div class="w-8 h-8 rounded bg-[hsl(var(--chart-1))]" title="Chart 1"></div>
        <div class="w-8 h-8 rounded bg-[hsl(var(--chart-2))]" title="Chart 2"></div>
        <div class="w-8 h-8 rounded bg-[hsl(var(--chart-3))]" title="Chart 3"></div>
        <div class="w-8 h-8 rounded bg-[hsl(var(--chart-4))]" title="Chart 4"></div>
        <div class="w-8 h-8 rounded bg-[hsl(var(--chart-5))]" title="Chart 5"></div>
      </div>
    </div>


  </div>
`;

export { lightTheme, darkTheme, tailwindColors, chartPalette, buttonStyles, CardComponent };
