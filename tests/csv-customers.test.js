import assert from 'node:assert/strict'
import test from 'node:test'

import { customerImportTemplateCsv, parseCustomerCsv } from '../src/csv-customers.js'

test('reads the downloadable Dutch template', () => {
  const result = parseCustomerCsv(customerImportTemplateCsv())
  assert.equal(result.issues.length, 0)
  assert.equal(result.customers.length, 1)
  assert.equal(result.customers[0].email, 'klant@voorbeeld.nl')
  assert.equal(result.customers[0].address.postal_code, '1234 AB')
})

test('reads Shopify customers and combines duplicate email rows', () => {
  const result = parseCustomerCsv('\uFEFFEmail,First Name,Last Name,Phone,Default Address Address1,Default Address Zip,Default Address City,Default Address Country Code,Accepts Email Marketing,Note\r\n"TEST@EXAMPLE.COM","Sophie","de Vries","06123","Markt 1","1234 AB","Utrecht","NL","yes","VIP"\r\n"test@example.com","","","","","","","","no",""')
  assert.equal(result.issues.length, 0)
  assert.equal(result.customers.length, 1)
  assert.equal(result.duplicateCount, 1)
  assert.equal(result.customers[0].first_name, 'Sophie')
  assert.equal(result.customers[0].marketing_opt_in, true)
  assert.equal(result.customers[0].address.city, 'Utrecht')
})

test('reads tab-separated rows and reports invalid email addresses', () => {
  const valid = parseCustomerCsv('E-mailadres\tNaam\tPostcode\njan@example.nl\tJan Jansen\t1234 ab')
  assert.equal(valid.delimiter, '\t')
  assert.equal(valid.customers[0].last_name, 'Jansen')
  assert.equal(valid.customers[0].address.postal_code, '1234 AB')

  const invalid = parseCustomerCsv('E-mailadres;Voornaam\ngeen-email;Jan')
  assert.equal(invalid.customers.length, 0)
  assert.equal(invalid.issues.length, 1)
})
