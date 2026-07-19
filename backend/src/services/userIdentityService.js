function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function isEmailUniqueConstraint(error) {
  return error?.code === 'SQLITE_CONSTRAINT'
    && /users\.email|users_email_normalized_unique/i.test(error.message || '');
}

module.exports = {
  isEmailUniqueConstraint,
  normalizeEmail
};
