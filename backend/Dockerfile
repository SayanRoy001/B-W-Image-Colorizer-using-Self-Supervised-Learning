# Use the official Python 3.9 image
FROM python:3.9

# Set the working directory to /code
WORKDIR /code

# Copy the requirements file into the container at /code/requirements.txt
COPY ./requirements.txt /code/requirements.txt

# Install the dependencies
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the rest of the backend code
COPY . /code

# Create a directory for the cache to avoid permission issues
RUN mkdir -p /code/cache && chmod 777 /code/cache
ENV XDG_CACHE_HOME=/code/cache

# Expose port 7860 for Hugging Face Spaces
EXPOSE 7860

# Command to run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
