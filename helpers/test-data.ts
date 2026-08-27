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
  /** Driver licence details for the identity step. */
  licenceState: 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'ACT' | 'NT';
  licenceNo: string;
  /** A single free-text address line for the Google Places field. */
  address: string;
  /** Reference contact (must differ from the applicant). */
  reference: {
    firstName: string;
    lastName: string;
    phone: string;
  };
};

function auMobile(): string {
  // AU mobile: 04xx xxx xxx — digits only for the phone mask field.
  return `04${faker.string.numeric(8)}`;
}

/** One valid-looking random Australian applicant for the whole wizard. */
export function makeApplicant(): ApplicantData {
  const birth = faker.date.birthdate({ min: 25, max: 55, mode: 'age' });
  const day = String(birth.getDate()).padStart(2, '0');
  const month = String(birth.getMonth() + 1).padStart(2, '0');
  const year = String(birth.getFullYear());

  const firstName = faker.person.firstName().replace(/[^A-Za-z'-]/g, '');
  const lastName = faker.person.lastName().replace(/[^A-Za-z'-]/g, '');

  // Unique per run so the anti-duplicate policy never rejects a repeat.
  // Use a real domain (gmail) — the app runs an MX-style domain check and
  // rejects domains without mail records (e.g. example.com).
  const stamp = Date.now().toString(36);
  const email = `${firstName}.${lastName}.${stamp}@gmail.com`
    .toLowerCase()
    .replace(/[^a-z0-9.@]/g, '');

  const refFirst = faker.person.firstName().replace(/[^A-Za-z'-]/g, '');
  const refLast = faker.person.lastName().replace(/[^A-Za-z'-]/g, '');

  return {
    title: faker.helpers.arrayElement(['Mr', 'Mrs', 'Miss', 'Ms'] as const),
    firstName,
    middleName: '',
    lastName,
    dobDay: day,
    dobMonth: month,
    dobYear: year,
    phone: auMobile(),
    email,
    licenceState: 'NSW',
    // NSW licences are up to 8 digits; keep it simple and unique-ish.
    licenceNo: faker.string.numeric(8),
    address: '1 Martin Place, Sydney NSW 2000',
    reference: {
      firstName: refFirst,
      lastName: refLast,
      phone: auMobile(),
    },
  };
}
