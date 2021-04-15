FROM ubuntu:20.04
ARG HTCAP_VERSION=master
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    TERM=xterm \
    DEBIAN_FRONTEND=noninteractive
RUN echo "LANG=en_US.UTF-8" > /etc/locale.conf && \
    echo "LC_ALL=en_US.UTF-8" >> /etc/environment && \
    echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
RUN apt-get update && \
    apt-get install -y locales apt-utils && \
    apt-get clean
RUN locale-gen en_US.UTF-8
    # htcap and scanner dependencies:
RUN apt-get install -y curl git python python3 python3-setuptools python3-pip nodejs npm && \
    # Chromium dependencies:
    apt-get install -y libasound2 libatk-bridge2.0-0 libgconf-2-4 libgtk-3-0 libnss3 libxss1 libxtst6 xvfb && \
    apt-get clean
WORKDIR "/usr/local/share"
RUN curl -Ls "https://github.com/fcavallarin/htcap/tarball/${HTCAP_VERSION}" -o htcap.tar.gz && \
    tar xzf htcap.tar.gz && \
    rm htcap.tar.gz && \
    mv fcavallarin-htcap-* htcap && \
    ln -s /usr/local/share/htcap/htcap.py /usr/local/bin/htcap
RUN cd htcap/core/nodejs/ && npm install
RUN curl -Ls https://github.com/Arachni/arachni/releases/download/v1.5.1/arachni-1.5.1-0.5.12-linux-x86_64.tar.gz -o arachni.tar.gz && \
    tar xzf arachni.tar.gz && \
    rm arachni.tar.gz && \
    mv arachni-1.5.1-* arachni && \
    ln -s /usr/local/share/arachni/bin/* /usr/local/bin/
RUN curl -Ls https://github.com/sqlmapproject/sqlmap/archive/1.5.4.tar.gz -o sqlmap.tar.gz && \
    tar xzf sqlmap.tar.gz && \
    rm sqlmap.tar.gz && \
    mv sqlmap-* sqlmap && \
    ln -s /usr/local/share/sqlmap/sqlmap.py /usr/local/bin/sqlmap
RUN curl -Ls https://sourceforge.net/projects/wapiti/files/wapiti/wapiti-3.0.4/wapiti3-3.0.4.tar.gz/download -o wapiti.tar.gz && \
    tar xzf wapiti.tar.gz && \
    rm wapiti.tar.gz && \
    mv wapiti3-* wapiti && \
    cd wapiti && \
    python3 setup.py install && \
    pip3 install six
WORKDIR /out
VOLUME /out
CMD ["sh", "-c", "while true; do sleep 10; done"]
#ENTRYPOINT ["/usr/bin/env", "bash"]
