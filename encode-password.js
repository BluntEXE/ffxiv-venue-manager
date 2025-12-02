// Helper script to URL-encode database passwords with special characters
// Usage: node encode-password.js "your-password-here"

const password = process.argv[2];

if (!password) {
  console.error('❌ Error: No password provided');
  console.log('\nUsage: node encode-password.js "your-password-here"');
  console.log('\nExample:');
  console.log('  node encode-password.js "my!pass#word@123"');
  process.exit(1);
}

console.log('Original password:', password);
console.log('URL-encoded password:', encodeURIComponent(password));
console.log('\nURL Encoding Reference:');
console.log('  ! → %21');
console.log('  # → %23');
console.log('  $ → %24');
console.log('  % → %25');
console.log('  & → %26');
console.log('  * → %2A');
console.log('  + → %2B');
console.log('  @ → %40');
console.log('  : → %3A');
console.log('  / → %2F');
console.log('\nCopy the "URL-encoded password" value into your .env file');
