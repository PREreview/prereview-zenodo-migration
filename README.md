# PREreview—Zenodo migration script

This is a script that compares the state of the PREreview information on
[Zenodo](https://zenodo.org/) with the PREreview API.

## Running it

1. Install [Node.js 16](https://nodejs.org/)
2. Get a [personal access token on Zenodo](https://zenodo.org/account/settings/applications/)
3. Create a `.env` file based on `.env.dist` and paste in the token
4. Run `npm ci`
5. Run `npm start`
6. See if `results.txt` has any changes to be made.
