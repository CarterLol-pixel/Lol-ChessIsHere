/**
 * NumbersUpTo1e1000.js
 *
 * A small arbitrary-range decimal library that comfortably represents values
 * far beyond Number.MAX_VALUE (≈1.79e308) up to and beyond 1e1000.
 *
 * Representation:
 *   value = sign * coefficient * 10^exponent
 *   - coefficient: BigInt (no trailing zeros, except 0)
 *   - exponent: Number (integer, can be large positive/negative)
 *   - sign: 1 or -1 (0 has sign 1 and coefficient 0)
 *
 * Notes:
 * - Addition/subtraction are exact (subject to available memory/time).
 * - Multiplication is exact.
 * - Division produces a decimal with a requested precision (default 40 decimal digits).
 * - toString produces normalized scientific notation by default.
 *
 * Usage:
 *   const a = BigNum.from("1.23e400");
 *   const b = BigNum.from("4.56e399");
 *   const c = a.add(b);
 *   console.log(c.toString()); // "1.686e+400"
 *
 * This file is intentionally small and dependency-free.
 */

class BigNum {
  // Create BigNum from various inputs (string, number, BigInt, BigNum)
  constructor(coefficient = 0n, exponent = 0, sign = 1) {
    // coefficient must be BigInt
    this.coefficient = typeof coefficient === "bigint" ? coefficient : BigInt(coefficient);
    this.exponent = Number(exponent) | 0;
    this.sign = this.coefficient === 0n ? 1 : (sign === -1 ? -1 : 1);
    this._normalize();
  }

  static ZERO = new BigNum(0n, 0, 1);

  // Parse strings like "123.45", "-1.23e4", "1e1000", numbers, BigInt
  static from(x) {
    if (x instanceof BigNum) return x;
    if (typeof x === "bigint") return new BigNum(x, 0, x < 0n ? -1 : 1);
    if (typeof x === "number") {
      if (!Number.isFinite(x)) throw new Error("Cannot construct BigNum from non-finite number");
      // Use number to string to preserve decimal digits available
      return BigNum.from(x.toString());
    }
    if (typeof x === "string") {
      const s = x.trim();
      if (!s) throw new Error("Cannot parse empty string");
      const m = s.match(/^([+-])?((?:\d+)(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/);
      if (!m) throw new Error("Invalid numeric string: " + s);
      const sign = m[1] === "-" ? -1 : 1;
      let num = m[2];
      const expPart = m[3] ? parseInt(m[3], 10) : 0;

      // Remove decimal point
      if (num.indexOf(".") >= 0) {
        const idx = num.indexOf(".");
        const digitsAfter = num.length - idx - 1;
        num = num.slice(0, idx) + num.slice(idx + 1);
        // Remove leading zeros in the whole string only after conversion to BigInt
        let coeff = num === "" ? 0n : BigInt(num);
        let exponent = expPart - digitsAfter;
        return new BigNum(coeff, exponent, sign);
      } else {
        // integer form
        const coeff = BigInt(num);
        const exponent = expPart;
        return new BigNum(coeff, exponent, sign);
      }
    }
    throw new Error("Unsupported type for BigNum.from: " + typeof x);
  }

  // Normalize: remove trailing zeros from coefficient by increasing exponent
  _normalize() {
    if (this.coefficient === 0n) {
      this.exponent = 0;
      this.sign = 1;
      return;
    }
    // remove trailing decimal zeros (factor 10)
    while (this.coefficient % 10n === 0n) {
      this.coefficient /= 10n;
      this.exponent += 1;
    }
    // ensure sign consistent
    if (this.coefficient < 0n) {
      this.coefficient = -this.coefficient;
      this.sign = -1;
    }
  }

  // Internal: align exponents and return [aCoeff, bCoeff, exponent]
  static _align(a, b) {
    if (a.coefficient === 0n) return [0n, b.coefficient * BigInt(b.sign), b.exponent];
    if (b.coefficient === 0n) return [a.coefficient * BigInt(a.sign), 0n, a.exponent];
    if (a.exponent === b.exponent) {
      return [a.coefficient * BigInt(a.sign), b.coefficient * BigInt(b.sign), a.exponent];
    }
    if (a.exponent > b.exponent) {
      const diff = a.exponent - b.exponent;
      // scale b up: bCoeff * 10^diff
      const scaledB = b.coefficient * BigInt(10) ** BigInt(diff);
      return [a.coefficient * BigInt(a.sign), scaledB * BigInt(b.sign), b.exponent + diff]; // return common exponent a.exponent
    } else {
      const diff = b.exponent - a.exponent;
      const scaledA = a.coefficient * BigInt(10) ** BigInt(diff);
      return [scaledA * BigInt(a.sign), b.coefficient * BigInt(b.sign), a.exponent + diff];
    }
  }

  // Addition
  add(other) {
    other = BigNum.from(other);
    if (this.coefficient === 0n) return new BigNum(other.coefficient, other.exponent, other.sign);
    if (other.coefficient === 0n) return new BigNum(this.coefficient, this.exponent, this.sign);

    const [aC, bC, exp] = BigNum._align(this, other);
    const sum = aC + bC; // signed BigInt
    if (sum === 0n) return BigNum.ZERO;
    const sign = sum < 0n ? -1 : 1;
    return new BigNum(sign === -1 ? -sum : sum, exp, sign);
  }

  // Subtraction
  sub(other) {
    other = BigNum.from(other);
    // subtract = add negative
    return this.add(new BigNum(other.coefficient, other.exponent, -other.sign));
  }

  // Multiplication
  mul(other) {
    other = BigNum.from(other);
    if (this.coefficient === 0n || other.coefficient === 0n) return BigNum.ZERO;
    const coeff = this.coefficient * other.coefficient;
    const exponent = this.exponent + other.exponent;
    const sign = this.sign * other.sign;
    return new BigNum(coeff, exponent, sign);
  }

  // Division with specified decimal precision (number of decimal digits after decimal point)
  // Returns rounded result with "precision" significant digits by default.
  div(other, precision = 40) {
    other = BigNum.from(other);
    if (other.coefficient === 0n) throw new Error("Division by zero");
    if (this.coefficient === 0n) return BigNum.ZERO;

    // value = (aCoeff * 10^aExp) / (bCoeff * 10^bExp)
    // = (aCoeff / bCoeff) * 10^(aExp - bExp)
    // We'll compute integer division with scaling to get 'precision' significant digits.
    const scale = precision + 5; // extra guard digits for rounding
    const scalePow = BigInt(10) ** BigInt(scale);
    const numerator = this.coefficient * scalePow;
    const quotient = numerator / other.coefficient;
    const exponent = this.exponent - other.exponent - scale;
    const sign = this.sign * other.sign;
    // rounding: remove guard digits
    // convert quotient to string and round to 'precision' significant digits
    let q = quotient;
    // Round: we keep 'precision' significant digits -> need to shift accordingly
    const totalDigits = q.toString().length;
    if (totalDigits > precision) {
      const drop = totalDigits - precision;
      const divisor = BigInt(10) ** BigInt(drop);
      const remainder = q % divisor;
      q = q / divisor;
      // simple round: if remainder * 2 >= divisor then round up
      if (remainder * 2n >= divisor) q += 1n;
      // exponent increases by drop
      return new BigNum(q, exponent + drop, sign);
    } else {
      // pad with zeros if needed (should not normally happen)
      return new BigNum(q, exponent, sign);
    }
  }

  // Integer power (exponent can be negative - returns BigNum possibly rational approximated by division)
  pow(n, precision = 40) {
    if (!Number.isInteger(n)) throw new Error("pow: exponent must be integer");
    if (n === 0) return new BigNum(1n, 0, 1);
    if (n > 0) {
      let res = new BigNum(1n, 0, 1);
      let base = new BigNum(this.coefficient, this.exponent, this.sign);
      let exp = n;
      while (exp > 0) {
        if (exp & 1) res = res.mul(base);
        base = base.mul(base);
        exp >>= 1;
      }
      return res;
    } else {
      // negative integer exponent -> 1 / (this ** -n)
      const positive = this.pow(-n);
      return BigNum.from(1).div(positive, precision);
    }
  }

  // Comparison: -1 if < other, 0 if equal, 1 if >
  cmp(other) {
    other = BigNum.from(other);
    if (this.coefficient === 0n && other.coefficient === 0n) return 0;
    if (this.sign !== other.sign) return this.sign > other.sign ? 1 : -1;
    // same sign
    const [aC, bC, _exp] = BigNum._align(this, other);
    if (aC === bC) return 0;
    const cmp = aC > bC ? 1 : -1;
    return this.sign === 1 ? cmp : -cmp;
  }

  eq(other) { return this.cmp(other) === 0; }
  lt(other) { return this.cmp(other) < 0; }
  lte(other) { return this.cmp(other) <= 0; }
  gt(other) { return this.cmp(other) > 0; }
  gte(other) { return this.cmp(other) >= 0; }

  // Convert to JavaScript Number if safely representable (approx)
  toNumber() {
    if (this.coefficient === 0n) return 0;
    // compute as sign * Number(coefficient) * 10^exponent
    // coefficient may be too big for Number, so use scientific string and parse.
    return Number(this.toString());
  }

  // Produce string in normalized scientific notation by default:
  // like "-1.23456e+400" or "0"
  toString(significant = 20) {
    if (this.coefficient === 0n) return "0";
    // Make a decimal representation with 'significant' significant digits
    const coeffStr = this.coefficient.toString(); // digits without sign or decimal
    const totalDigits = coeffStr.length;
    const exponent = this.exponent + (totalDigits - 1);
    // build mantissa with one digit before decimal
    if (totalDigits <= significant) {
      // take all digits
      const mantissa = coeffStr[0] + (totalDigits > 1 ? "." + coeffStr.slice(1) : "");
      return (this.sign < 0 ? "-" : "") + mantissa + "e" + (exponent >= 0 ? "+" : "") + exponent;
    } else {
      // need to round to 'significant' digits
      const keep = significant;
      const left = coeffStr.slice(0, keep);
      const rest = coeffStr.slice(keep);
      // rounding
      let rounded = BigInt(left);
      if (rest[0] >= '5') {
        rounded += 1n;
      }
      let roundedStr = rounded.toString();
      // if rounding increased digit count (e.g., 9.99 -> 10.0)
      if (roundedStr.length > keep) {
        // adjust exponent
        const mantissa = roundedStr[0] + (roundedStr.length > 1 ? "." + roundedStr.slice(1) : "");
        const adjExp = exponent + 1;
        return (this.sign < 0 ? "-" : "") + mantissa + "e" + (adjExp >= 0 ? "+" : "") + adjExp;
      } else {
        const mantissa = roundedStr[0] + (roundedStr.length > 1 ? "." + roundedStr.slice(1) : "");
        return (this.sign < 0 ? "-" : "") + mantissa + "e" + (exponent >= 0 ? "+" : "") + exponent;
      }
    }
  }

  // toFixed: produce decimal string with 'decimals' digits after decimal point.
  // This may require scaling coefficients and adding zeros.
  toFixed(decimals = 20) {
    if (this.coefficient === 0n) {
      return "0." + "0".repeat(decimals);
    }
    // value = sign * coefficient * 10^exponent
    // We want integer part and fractional part with decimals digits.
    // Move decimal point: shift = exponent
    // Build coefficient string with possible leading/trailing zeros
    const coeffStr = this.coefficient.toString();
    const shift = this.exponent; // where decimal point is relative to coeffStr end
    // The number without decimal: coeffStr followed by shift zeros
    if (shift >= 0) {
      const intStr = coeffStr + "0".repeat(shift);
      return (this.sign < 0 ? "-" : "") + intStr + "." + "0".repeat(decimals);
    } else {
      // Negative shift: decimal point is inside or to left of coeffStr
      const absShift = -shift;
      if (absShift < coeffStr.length) {
        const idx = coeffStr.length - absShift;
        const intPart = coeffStr.slice(0, idx);
        let fracPart = coeffStr.slice(idx) + "0".repeat(Math.max(0, decimals - (coeffStr.length - idx)));
        fracPart = fracPart.slice(0, decimals);
        return (this.sign < 0 ? "-" : "") + intPart + "." + fracPart;
      } else {
        // leading zeros
        const zeros = "0".repeat(absShift - coeffStr.length);
        const fracPart = zeros + coeffStr + "0".repeat(Math.max(0, decimals - (zeros.length + coeffStr.length)));
        return (this.sign < 0 ? "-" : "") + "0." + fracPart.slice(0, decimals);
      }
    }
  }
}

// Example convenience alias
const NumbersUpTo1e1000 = {
  BigNum,
  from: (v) => BigNum.from(v),
};

// Simple tests / examples (uncomment to run)
/*
const a = NumbersUpTo1e1000.from("9.99e999");
const b = NumbersUpTo1e1000.from("2.5e998");
console.log("a:", a.toString(10));
console.log("b:", b.toString(10));
const c = a.add(b);
console.log("a + b =", c.toString(15));
console.log("a * b =", a.mul(b).toString(15));
console.log("a / b =", a.div(b, 30).toString(20));
console.log("1e1000 as BigNum:", NumbersUpTo1e1000.from("1e1000").toString(8));
console.log("toFixed example:", NumbersUpTo1e1000.from("12345.6789").toFixed(6));
*/

if (typeof module !== "undefined") module.exports = NumbersUpTo1e1000;
