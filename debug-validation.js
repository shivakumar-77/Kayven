// Copy the validation logic to debug
const plans = {
  // Monthly plans
  'free-monthly': {
    planId: 'free',
    displayName: 'Free',
    billingPeriod: 'monthly',
    mrp: 0,
    discountAmount: 0,
    offerPrice: 0,
    displayDiscountPercentage: 0,
    currency: 'INR',
    razorpaySubscriptionLink: '' // Free plan doesn't need Razorpay link
  },
  'basic-monthly': {
    planId: 'basic',
    displayName: 'Basic',
    billingPeriod: 'monthly',
    mrp: 499,
    discountAmount: 200,
    offerPrice: 299,
    displayDiscountPercentage: 40,
    currency: 'INR',
    razorpaySubscriptionLink: 'https://rzp.io/rzp/XFnNNi6V'
  },
  'standard-monthly': {
    planId: 'standard',
    displayName: 'Standard',
    billingPeriod: 'monthly',
    mrp: 799,
    discountAmount: 300,
    offerPrice: 499,
    displayDiscountPercentage: 38,
    currency: 'INR',
    razorpaySubscriptionLink: 'https://rzp.io/rzp/QLHMTsIP'
  },
  'pro-monthly': {
    planId: 'pro',
    displayName: 'Pro AI',
    billingPeriod: 'monthly',
    mrp: 1999,
    discountAmount: 600,
    offerPrice: 1399,
    displayDiscountPercentage: 30,
    currency: 'INR',
    razorpaySubscriptionLink: 'https://rzp.io/rzp/Sn62QBB'
  },
  // Yearly plans
  'free-yearly': {
    planId: 'free',
    displayName: 'Free',
    billingPeriod: 'yearly',
    mrp: 0,
    discountAmount: 0,
    offerPrice: 0,
    displayDiscountPercentage: 0,
    currency: 'INR',
    razorpaySubscriptionLink: '' // Free plan doesn't need Razorpay link
  },
  'basic-yearly': {
    planId: 'basic',
    displayName: 'Basic',
    billingPeriod: 'yearly',
    mrp: 3999,
    discountAmount: 1700,
    offerPrice: 2299,
    displayDiscountPercentage: 43,
    currency: 'INR',
    razorpaySubscriptionLink: 'https://rzp.io/rzp/v6Uhwes'
  },
  'standard-yearly': {
    planId: 'standard',
    displayName: 'Standard',
    billingPeriod: 'yearly',
    mrp: 6499,
    discountAmount: 2600,
    offerPrice: 3899,
    displayDiscountPercentage: 40,
    currency: 'INR',
    razorpaySubscriptionLink: 'https://rzp.io/rzp/sHzyIbN'
  },
  'pro-yearly': {
    planId: 'pro',
    displayName: 'Pro AI',
    billingPeriod: 'yearly',
    mrp: 15499,
    discountAmount: 4600,
    offerPrice: 10899,
    displayDiscountPercentage: 30,
    currency: 'INR',
    razorpaySubscriptionLink: 'https://rzp.io/rzp/zpf9JhW'
  },
  'premium-monthly': {
    planId: 'premium',
    displayName: 'Premium',
    billingPeriod: 'monthly',
    mrp: 799,
    discountAmount: 200,
    offerPrice: 599,
    displayDiscountPercentage: 25,
    currency: 'INR',
    razorpaySubscriptionLink: ''
  },
  'premium-yearly': {
    planId: 'premium',
    displayName: 'Premium',
    billingPeriod: 'yearly',
    mrp: 7990,
    discountAmount: 2000,
    offerPrice: 5990,
    displayDiscountPercentage: 25,
    currency: 'INR',
    razorpaySubscriptionLink: ''
  }
};

function validateRazorpayPlanConfig(config) {
  const calculatedOfferPrice = config.mrp - config.discountAmount;
  const calculatedDiscountPercentage = Math.round((config.discountAmount / config.mrp) * 100);

  return config.offerPrice === calculatedOfferPrice &&
         config.displayDiscountPercentage === calculatedDiscountPercentage;
}

console.log('Validating all plans:');
let allValid = true;
for (const [key, config] of Object.entries(plans)) {
  const isValid = validateRazorpayPlanConfig(config);
  console.log(`${key}: ${isValid}`);
  if (!isValid) {
    allValid = false;
    console.log(`  mrp: ${config.mrp}`);
    console.log(`  discountAmount: ${config.discountAmount}`);
    console.log(`  offerPrice: ${config.offerPrice}`);
    console.log(`  calculatedOfferPrice: ${config.mrp - config.discountAmount}`);
    console.log(`  displayDiscountPercentage: ${config.displayDiscountPercentage}`);
    console.log(`  calculatedDiscountPercentage: ${Math.round((config.discountAmount / config.mrp) * 100)}`);
  }
}

console.log(`\nAll plans valid: ${allValid}`);