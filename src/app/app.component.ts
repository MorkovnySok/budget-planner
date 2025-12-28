import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Category {
  name: string;
  percentage: number;
  amount: number;
  isSavings: boolean;
}

interface PieSlice {
  name: string;
  percentage: number;
  color: string;
  path: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  income = 0;
  interestRate = 0;
  forecastPeriodValue = 12;
  forecastPeriodUnit: 'months' | 'years' = 'months';
  categories: Category[] = [];
  allocationClamped = false;
  needsIncomeWarning = false;
  private readonly chartColors = ['#2563eb', '#f97316', '#14b8a6', '#a855f7', '#facc15', '#10b981'];

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

    let startAngle = 0;
    return this.categories
      .filter((category) => category.percentage > 0)
      .map((category, index) => {
        const angle = (category.percentage / total) * 360;
        const endAngle = startAngle + angle;
        const slice: PieSlice = {
          name: category.name || `Category ${index + 1}`,
          percentage: category.percentage,
          color: this.chartColors[index % this.chartColors.length],
          path: this.describeArc(60, 60, 54, startAngle, endAngle)
        };
        startAngle = endAngle;
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
    const contribution = this.totalSavingsAllocation;
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
  }

  removeCategory(index: number): void {
    this.categories.splice(index, 1);
    this.allocationClamped = false;
    this.needsIncomeWarning = false;
  }

  updateIncome(value: string | number): void {
    const parsed = this.parseNumber(value);
    this.income = Math.max(0, parsed);
    this.needsIncomeWarning = false;
    this.recalculateAmounts();
  }

  updateInterestRate(value: string | number): void {
    const parsed = this.parseNumber(value);
    this.interestRate = Math.max(0, parsed);
  }

  updateForecastPeriodValue(value: string | number): void {
    const parsed = this.parseNumber(value);
    this.forecastPeriodValue = Math.max(0, parsed);
  }

  updateForecastPeriodUnit(value: 'months' | 'years'): void {
    this.forecastPeriodUnit = value;
  }

  updateCategoryName(index: number, value: string): void {
    this.categories[index].name = value;
  }

  updateCategorySavings(index: number, value: boolean): void {
    this.categories[index].isSavings = value;
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
  }

  updateCategoryAmount(index: number, value: string | number): void {
    const amount = Math.max(0, this.parseNumber(value));
    this.categories[index].amount = this.roundCurrency(amount);
    if (this.income <= 0) {
      this.categories[index].percentage = 0;
      this.needsIncomeWarning = amount > 0;
      return;
    }

    const rawPercentage = (amount / this.income) * 100;
    const maxAllowed = this.maxPercentageFor(index);
    const nextPercentage = Math.min(rawPercentage, maxAllowed);
    this.allocationClamped = rawPercentage > maxAllowed;
    this.categories[index].percentage = this.roundPercentage(nextPercentage);
    this.categories[index].amount = this.roundCurrency(
      (this.income * this.categories[index].percentage) / 100
    );
    this.needsIncomeWarning = false;
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

  private clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundPercentage(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  }

  private describeArc(
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): string {
    if (endAngle - startAngle >= 360) {
      const diameter = radius * 2;
      return [
        `M ${centerX} ${centerY}`,
        `m ${-radius} 0`,
        `a ${radius} ${radius} 0 1 0 ${diameter} 0`,
        `a ${radius} ${radius} 0 1 0 ${-diameter} 0`
      ].join(' ');
    }
    const start = this.polarToCartesian(centerX, centerY, radius, endAngle);
    const end = this.polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return [
      `M ${centerX} ${centerY}`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
      'Z'
    ].join(' ');
  }
}
