// User-facing copy, ported from lib/strings.dart. Grade-2 reading level in the
// child's views; no numbers in the child's experience.

const titleCase = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

export const S = {
  // Welcome
  welcomeTitle: "Hi!\nI'm Chompy",
  welcomeBody: "I help you eat all your food colours. Let’s start.",
  welcomeCta: "Get started",

  // Phone
  phoneStep: "Step 1 of 3",
  phoneTitle: "Your phone number",
  phoneBody: "A grown-up’s number is best — we send a 6-digit code to it.",
  phonePlaceholder: "98765 43210",
  phoneHintEmpty: "10 numbers, no spaces needed.",
  phoneHintRemaining: (n: number) => `${n} more ${n === 1 ? "number" : "numbers"} to go`,
  phoneHintValid: "Looks good!",
  phoneCta: "Send my code",

  sendingTitle: "Sending your code…",
  sendingBody: (phone: string) => `To +91 ${phone}. This takes a few seconds.`,

  // OTP
  otpStep: "Step 2 of 3",
  otpTitle: "Type the code",
  otpBody: (phone: string) =>
    `We sent 6 numbers to +91 ${phone}. The code works for 5 minutes.`,
  otpCta: "Check my code",
  otpChangeNumber: "Change phone number →",
  otpWrongTitle: "Those numbers don’t match",
  otpWrongBody:
    "Check the message again and type the 6 numbers. If you can’t find it, start again with your phone number.",
  otpExpiredTitle: "That code got too old",
  otpExpiredBody:
    "Codes only work for 5 minutes. Put your phone number in again to get a fresh one.",
  verifyingTitle: "Checking your code…",
  verifyingBody: "Hang on one moment.",

  // Profile
  profileStep: "Step 3 of 3 · for a grown-up",
  profileTitle: (name: string) => (name ? `About ${titleCase(name)}` : "About you"),
  labelName: "Name",
  labelDob: "Date of birth",
  labelGender: "Gender",
  labelHeight: "Height (cm)",
  labelWeight: "Weight (kg)",
  genders: ["Boy", "Girl"] as const,
  profileHelper: (name: string) =>
    name
      ? `Height and weight help set goals. A grown-up can update them any time as ${name.trim()} grows.`
      : "Height and weight help set goals. A grown-up can update them any time as your child grows.",
  profileCtaReady: "Start using Chompy",

  // Home
  greeting: (name: string) => `Hi ${name ? name.trim() : "there"}!`,
  homeStatus: (meals: number) =>
    meals >= 3
      ? "Three meals logged. You are on a roll."
      : `You logged ${meals} meals today. What was next?`,
  homeCta: "Log a meal",
  homeFoodGroups: "Today’s food families",
  homeMeals: "Meals today",
  mealEmpty: "Nothing yet",

  // My food
  myFoodTitle: "My food",
  myFoodHomeHint: (families: number) =>
    families === 5 ? "All five families today" : `${families} of 5 families today`,
  tabToday: "Today",
  tabWeek: "This week",
  youAte: "You ate",
  familiesLabel: "Your five food families",
  familiesLineToday: (n: number) =>
    n === 5
      ? "You have eaten from all five families today."
      : `You have eaten from ${n} of the five families today.`,
  familiesLineWeek: "How many days you ate from each family.",
  familiesLineDay: (n: number) =>
    n === 5
      ? "Ate from all five families this day."
      : `Ate from ${n} of the five families this day.`,
  familyEaten: "Eaten today",
  familyEatenDay: "Eaten",
  dayNoMeals: "No meals were logged on this day.",
  familyNotThisWeek: "Not this week",
  familyEveryDay: "Every day",
  familyDays: (n: number, of: number) => `${n} of ${of} days`,
  familyLabels: ["Grains", "Dals & eggs", "Vegetables", "Fruit", "Milk food"] as const,
  familyExamples: [
    "roti, rice, idli",
    "dal, paneer, egg",
    "bhindi, carrot",
    "banana, mango",
    "curd, milk, cheese",
  ] as const,
  weekDaysLabel: "Earlier days",
  weekDaysExplainer: "Tap a day to see it. A tick means every family was eaten that day.",
  nutritionDay: "Nutrition",
  nutritionToday: "Nutrition today",
  nutritionTodayExplainer:
    "How much of each you have had, out of what you need in a day.",
  nutritionWeek: "Nutrition this week",
  nutritionWeekExplainer: "Your average day this week, out of what you need in a day.",
  nutritionOf: (target: string) => `of ${target}`,
  nutritionSource: "Daily needs for your age, from the ICMR-NIN recommended intakes.",
  nutrientLabels: [
    "Calories",
    "Protein",
    "Carbs",
    "Fat",
    "Fibre",
    "Calcium",
    "Iron",
    "Vitamin A",
    "Vitamin C",
  ] as const,

  // Entry modes
  modeTitle: "What did you eat?",
  modePhoto: "Take a photo",
  modePhotoHint: "Point at your plate. Fastest way.",
  modeType: "Type it",
  modeTypeHint: "Write what you ate, or tap a food you like.",
  modeFooter:
    "Any way you pick, you can fix it later. Nothing is saved until you say so.",

  cancelledTitle: "No photo yet",
  cancelledBody:
    "That’s okay. You can try the camera again, or tell Chompy another way.",
  cancelledRetry: "Take a photo",
  cancelledOther: "Pick another way",

  // Typed entry
  typeTitle: "Type your food",
  typePlaceholder: "2 roti, dal, some cucumber",
  likedFoodsLabel: "Foods you like",
  typeCta: "See what Chompy finds",

  // Detecting
  detectingTitle: "Chompy is looking…",
  detectingBody: "Finding the food. You can fix anything I get wrong.",

  // Review
  reviewTitle: "Is this right?",
  reviewBody: "Fix anything, then tell me it’s right.",
  reviewTitleEmpty: "Let’s add it together",
  reviewBodyEmpty: "Chompy needs a little help this time.",
  reviewWhen: "When was it?",
  reviewFound: "Chompy found",
  reviewAddMissed: "Add something I missed",
  reviewCta: "Yes, that’s right",
  reviewCtaEmpty: "Add one food first",
  reviewHelper: "A grown-up can change this later.",
  categories: ["Breakfast", "Lunch", "Dinner", "Snacks"] as const,
  emptyDetectTitle: "I didn’t spot anything",
  emptyDetectBody:
    "No problem — tap add below to put it in yourself, and I’ll learn.",

  // Saving / result
  savingTitle: "Saving your meal…",
  savingBody: "Keeping it safe.",
  factKicker: "Chompy fact",
  factFinish: "Finish →",
  savedTitle: "All done!",
  savedBody: (category: string, count: number) =>
    `Chompy saved your ${category.toLowerCase()}. ${count} foods on the list.`,
  savedCta: "Back home",

  failedTitle: "It didn’t save",
  failedBody:
    "The internet went wobbly. Your food is still here — nothing is lost.",
  failedRetry: "Try again",
  failedBack: "Back to my food",

  factFallback: "Every food does a different job in your body.",

  likedFoods: ["Banana", "Curd", "Paneer", "Idli", "Carrot"] as const,
  units: ["piece", "pieces", "bowl", "bowls", "slices", "sticks", "g", "ml"] as const,
};
