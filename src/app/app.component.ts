import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Category {
  name: string;
  percentage: number;
  amount: number;
  isSavings: boolean;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  income = 0;
  categories: Category[] = [];
  allocationClamped = false;
  needsIncomeWarning = false;

  get totalPercentage(): number {
    return this.categories.reduce((total, category) => total + category.percentage, 0);
  }

  get remainingPercentage(): number {
    return Math.max(0, 100 - this.totalPercentage);
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
}
