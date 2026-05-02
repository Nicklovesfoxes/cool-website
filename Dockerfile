FROM jekyll/jekyll:latest AS builder
# Set the working directory
WORKDIR /srv/jekyll

# Copy the repository files and assign ownership to the jekyll user
COPY --chown=jekyll:jekyll . /srv/jekyll

# Remove any conflicting local lockfiles, install dependencies, and build the site
RUN rm -f Gemfile.lock && \
    bundle install && \
    bundle exec jekyll build

FROM nginx:alpine
COPY --from=builder /srv/jekyll/_site /usr/share/nginx/html