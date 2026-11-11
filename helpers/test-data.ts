import { faker } from '@faker-js/faker/locale/en_AU';

export type ApplicantData = {
  title: 'Mr' | 'Mrs' | 'Miss' | 'Ms' | 'Dr';
  firstName: string;
  middleName: string;
  lastName: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  phone: string;
  email: string;
  licenceState: 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'ACT' | 'NT';
  licenceNo: string;
  address: string;
  reference: {
    firstName: string;
    lastName: string;
    phone: string;
  };
};

function auMobile(): string {
  return `04${faker.string.numeric(8)}`;
}

/** One valid-looking random Australian applicant for the whole wizard. */
export function makeApplicant(): ApplicantData {
  const birth = faker.date.birthdate({ min: 25, max: 55, mode: 'age' });
  // APPLICANT_DOB is YYYY-MM-DD. With DOB, licence or phone/email set, Albert matches the run to an
  // existing borrower, so statement rules that only decline new clients (3+ SACC dishonours) let it through.
  const dob = (process.env.APPLICANT_DOB || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = dob ? dob[3] : String(birth.getDate()).padStart(2, '0');
  const month = dob ? dob[2] : String(birth.getMonth() + 1).padStart(2, '0');
  const year = dob ? dob[1] : String(birth.getFullYear());

  // APPLICANT_* lets a replay apply as the statement's account holder, so Adam does not stop at
  // "these accounts are not in your name" and asks the normal budget questions.
  const firstName = (process.env.APPLICANT_FIRST_NAME || faker.person.firstName()).replace(/[^A-Za-z'-]/g, '');
  const middleName = (process.env.APPLICANT_MIDDLE_NAME || '').replace(/[^A-Za-z'-]/g, '');
  const lastName = (process.env.APPLICANT_LAST_NAME || faker.person.lastName()).replace(/[^A-Za-z'-]/g, '');

  // Unique per run so the anti-duplicate policy never rejects a repeat.
  // Use a real domain (gmail) — the app runs an MX-style domain check and
  // rejects domains without mail records (e.g. example.com).
  const stamp = Date.now().toString(36);
  const email = process.env.APPLICANT_EMAIL || `${firstName}.${lastName}.${stamp}@gmail.com`
    .toLowerCase()
    .replace(/[^a-z0-9.@]/g, '');

  const refFirst = faker.person.firstName().replace(/[^A-Za-z'-]/g, '');
  const refLast = faker.person.lastName().replace(/[^A-Za-z'-]/g, '');

  return {
    title: faker.helpers.arrayElement(['Mr', 'Mrs', 'Miss', 'Ms'] as const),
    firstName,
    middleName,
    lastName,
    dobDay: day,
    dobMonth: month,
    dobYear: year,
    phone: (process.env.APPLICANT_PHONE || '').replace(/\D/g, '') || auMobile(),
    email,
    licenceState: 'NSW',
    licenceNo: process.env.APPLICANT_LICENCE || faker.string.numeric(8),
    address: '1 Martin Place, Sydney NSW 2000',
    reference: {
      firstName: refFirst,
      lastName: refLast,
      phone: auMobile(),
    },
  };
}
