import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Category {
  name: string;
  percentage: number;
  amount: number;
  isSavings: boolean;
}

interface BudgetPlannerState {
  income: number;
  interestRate: number;
  forecastPeriodValue: number;
  forecastPeriodUnit: 'months' | 'years';
  categories: Category[];
}

interface PieSlice {
  name: string;
  percentage: number;
  color: string;
}

interface SavingsForecast {
  name: string;
  monthlyContribution: number;
  projectedValue: number;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('categoryChart') categoryChart?: ElementRef<HTMLCanvasElement>;

  income = 0;
  interestRate = 0;
  forecastPeriodValue = 12;
  forecastPeriodUnit: 'months' | 'years' = 'months';
  categories: Category[] = [];
  allocationClamped = false;
  needsIncomeWarning = false;
  importError = '';
  private readonly storageKey = 'budgetPlannerState';
  private readonly chartColors = ['#2563eb', '#f97316', '#14b8a6', '#a855f7', '#facc15', '#10b981'];
  private viewReady = false;

  ngOnInit(): void {
    this.loadState();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderChart();
  }

  get totalPercentage(): number {
    return this.categories.reduce((total, category) => total + category.percentage, 0);
  }

  get remainingPercentage(): number {
    return Math.max(0, 100 - this.totalPercentage);
  }

  get pieSlices(): PieSlice[] {
    const total = this.totalPercentage;
    if (total <= 0) {
      return [];
    }

    return this.categories
      .filter((category) => category.percentage > 0)
      .map((category, index) => {
        const slice: PieSlice = {
          name: category.name || `Category ${index + 1}`,
          percentage: category.percentage,
          color: this.chartColors[index % this.chartColors.length]
        };
        return slice;
      });
  }

  get totalSavingsAllocation(): number {
    const total = this.categories
      .filter((category) => category.isSavings)
      .reduce((sum, category) => sum + category.amount, 0);
    return this.roundCurrency(total);
  }

  get forecastMonths(): number {
    const value = Math.max(0, this.parseNumber(this.forecastPeriodValue));
    const months = this.forecastPeriodUnit === 'years' ? value * 12 : value;
    return months;
  }

  get forecastLabel(): string {
    const period = this.forecastPeriodUnit === 'years' ? 'year' : 'month';
    const count = this.forecastPeriodUnit === 'years' ? this.forecastPeriodValue : this.forecastPeriodValue;
    return `${count} ${period}${count === 1 ? '' : 's'}`;
  }

  get projectedSavingsValue(): number {
    return this.futureValueForContribution(this.totalSavingsAllocation);
  }

  get savingsForecasts(): SavingsForecast[] {
    const savingsCategories = this.categories.filter((category) => category.isSavings);
    return savingsCategories.map((category, index) => ({
      name: category.name?.trim() || `Savings ${index + 1}`,
      monthlyContribution: category.amount,
      projectedValue: this.futureValueForContribution(category.amount)
    }));
  }

  addCategory(): void {
    this.categories = [
      ...this.categories,
      {
        name: `Category ${this.categories.length + 1}`,
        percentage: 0,
        amount: 0,
        isSavings: false
      }
    ];
    this.allocationClamped = false;
    this.persistState();
  }

  removeCategory(index: number): void {
    this.categories.splice(index, 1);
    this.allocationClamped = false;
    this.needsIncomeWarning = false;
    this.persistState();
  }

  updateIncome(value: string | number): void {
    const parsed = this.parseNumber(value);
    this.income = Math.max(0, parsed);
    this.needsIncomeWarning = false;
    this.recalculateAmounts();
    this.persistState();
  }

  updateInterestRate(value: string | number): void {
    const parsed = this.parseNumber(value);
    this.interestRate = Math.max(0, parsed);
    this.persistState();
  }

  updateForecastPeriodValue(value: string | number): void {
    const parsed = this.parseNumber(value);
    this.forecastPeriodValue = Math.max(0, parsed);
    this.persistState();
  }

  updateForecastPeriodUnit(value: 'months' | 'years'): void {
    this.forecastPeriodUnit = value;
    this.persistState();
  }

  updateCategoryName(index: number, value: string): void {
    this.categories[index].name = value;
    this.persistState();
  }

  updateCategorySavings(index: number, value: boolean): void {
    this.categories[index].isSavings = value;
    this.persistState();
  }

  updateCategoryPercentage(index: number, value: string | number): void {
    const parsed = this.clampNumber(this.parseNumber(value), 0, 100);
    const maxAllowed = this.maxPercentageFor(index);
    const nextPercentage = Math.min(parsed, maxAllowed);
    this.allocationClamped = parsed > maxAllowed;
    this.categories[index].percentage = this.roundPercentage(nextPercentage);
    this.categories[index].amount = this.roundCurrency(
      (this.income * this.categories[index].percentage) / 100
    );
    this.persistState();
  }

  updateCategoryAmount(index: number, value: string | number): void {
    const amount = Math.max(0, this.parseNumber(value));
    this.categories[index].amount = this.roundCurrency(amount);
    if (this.income <= 0) {
      this.categories[index].percentage = 0;
      this.needsIncomeWarning = amount > 0;
      this.persistState();
      return;
    }

    const rawPercentage = (amount / this.income) * 100;
    const maxAllowed = this.maxPercentageFor(index);
    const isClamped = rawPercentage > maxAllowed;
    const nextPercentage = isClamped ? maxAllowed : rawPercentage;
    this.allocationClamped = isClamped;
    this.categories[index].percentage = this.roundPercentage(nextPercentage);
    if (isClamped) {
      this.categories[index].amount = this.roundCurrency(
        (this.income * this.categories[index].percentage) / 100
      );
    }
    this.needsIncomeWarning = false;
    this.persistState();
  }

  exportBudgetData(): void {
    const payload = JSON.stringify(this.buildState(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'budget-planner-data.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  importBudgetData(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = this.safeParseJson(text);
      const state = parsed ? this.parseState(parsed) : null;
      if (!state) {
        this.importError = 'Import failed. The selected file is not a valid budget export.';
        return;
      }
      this.applyState(state);
      this.importError = '';
      this.persistState();
    };
    reader.onerror = () => {
      this.importError = 'Import failed. Please try a different file.';
    };
    reader.readAsText(file);
    input.value = '';
  }

  private recalculateAmounts(): void {
    this.categories = this.categories.map((category) => ({
      ...category,
      amount: this.roundCurrency((this.income * category.percentage) / 100)
    }));
  }

  private maxPercentageFor(index: number): number {
    const allocated = this.categories.reduce(
      (total, category, categoryIndex) =>
        categoryIndex === index ? total : total + category.percentage,
      0
    );
    return Math.max(0, 100 - allocated);
  }

  private parseNumber(value: string | number): number {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private futureValueForContribution(contribution: number): number {
    if (contribution <= 0 || this.forecastMonths <= 0) {
      return 0;
    }
    // Assumes an annual interest rate compounded monthly over the selected forecast period.
    const annualRate = Math.max(0, this.interestRate) / 100;
    const monthlyRate = annualRate / 12;
    if (monthlyRate === 0) {
      return this.roundCurrency(contribution * this.forecastMonths);
    }
    const growthFactor = Math.pow(1 + monthlyRate, this.forecastMonths);
    const futureValue = contribution * ((growthFactor - 1) / monthlyRate);
    return this.roundCurrency(futureValue);
  }

  private buildState(): BudgetPlannerState {
    return {
      income: this.roundCurrency(this.income),
      interestRate: this.roundPercentage(this.interestRate),
      forecastPeriodValue: this.forecastPeriodValue,
      forecastPeriodUnit: this.forecastPeriodUnit,
      categories: this.categories.map((category) => ({
        name: category.name,
        percentage: category.percentage,
        amount: category.amount,
        isSavings: category.isSavings
      }))
    };
  }

  private applyState(state: BudgetPlannerState): void {
    this.income = Math.max(0, this.parseNumber(state.income));
    this.interestRate = Math.max(0, this.parseNumber(state.interestRate));
    this.forecastPeriodValue = Math.max(0, this.parseNumber(state.forecastPeriodValue));
    this.forecastPeriodUnit = state.forecastPeriodUnit;
    this.categories = state.categories;
    this.allocationClamped = false;
    this.needsIncomeWarning = false;
  }

  private loadState(): void {
    if (!this.storageAvailable()) {
      return;
    }
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return;
    }
    const parsed = this.safeParseJson(raw);
    const state = parsed ? this.parseState(parsed) : null;
    if (state) {
      this.applyState(state);
    }
  }

  private persistState(): void {
    if (!this.storageAvailable()) {
      return;
    }
    localStorage.setItem(this.storageKey, JSON.stringify(this.buildState()));
    this.renderChart();
  }

  private safeParseJson(raw: string): unknown | null {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  private parseState(value: unknown): BudgetPlannerState | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const data = value as Record<string, unknown>;
    const forecastUnit = data['forecastPeriodUnit'] === 'years' ? 'years' : 'months';
    const categories = Array.isArray(data['categories'])
      ? data['categories']
          .filter((item) => item && typeof item === 'object')
          .map((item, index) => {
            const entry = item as Record<string, unknown>;
            const name = this.coerceString(entry['name'], `Category ${index + 1}`);
            const percentage = this.clampNumber(this.coerceNumber(entry['percentage']), 0, 100);
            const amount = Math.max(0, this.coerceNumber(entry['amount']));
            const isSavings = this.coerceBoolean(entry['isSavings']);
            return {
              name,
              percentage: this.roundPercentage(percentage),
              amount: this.roundCurrency(amount),
              isSavings
            };
          })
      : [];
    return {
      income: Math.max(0, this.coerceNumber(data['income'])),
      interestRate: Math.max(0, this.coerceNumber(data['interestRate'])),
      forecastPeriodValue: Math.max(0, this.coerceNumber(data['forecastPeriodValue'], 12)),
      forecastPeriodUnit: forecastUnit,
      categories
    };
  }

  private storageAvailable(): boolean {
    try {
      return typeof localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  private coerceString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private coerceNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : fallback;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  }

  private coerceBoolean(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundPercentage(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private renderChart(): void {
    if (!this.viewReady) {
      return;
    }
    const canvas = this.categoryChart?.nativeElement;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const scaledWidth = Math.floor(width * ratio);
    const scaledHeight = Math.floor(height * ratio);

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const slices = this.pieSlices;
    if (slices.length === 0) {
      this.drawEmptyState(context, width, height);
      return;
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(0, Math.min(centerX, centerY) - 8);
    const total = slices.reduce((sum, slice) => sum + slice.percentage, 0);
    let startAngle = -Math.PI / 2;

    slices.forEach((slice) => {
      const sliceAngle = total > 0 ? (slice.percentage / total) * Math.PI * 2 : 0;
      const endAngle = startAngle + sliceAngle;

      context.beginPath();
      context.moveTo(centerX, centerY);
      context.arc(centerX, centerY, radius, startAngle, endAngle);
      context.closePath();
      context.fillStyle = slice.color;
      context.fill();

      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.stroke();

      startAngle = endAngle;
    });
  }

  private drawEmptyState(context: CanvasRenderingContext2D, width: number, height: number): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(0, Math.min(centerX, centerY) - 8);

    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = '#f1f5f9';
    context.fill();

    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = '#94a3b8';
    context.font = '14px Inter, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Add categories to see a breakdown.', centerX, centerY);
  }
}
